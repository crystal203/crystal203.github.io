"""Native equipment qualification and manually controlled projectile dependencies.
Character identities stay unchanged. Native WeaponSpec.IsExclusiveCharacter delegates
same-origin/gender equivalence to CharacterSpecId; these constants are from .cctor.
"""
ELF='d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db'
GROUPS=[{1,2},{52,53}]

def exclusive_origin_ids(origins):
    result=set(origins)
    for group in GROUPS:
        if result & group:result.update(group)
    return result

def collect_weapon_rows(items,heroes,actions):
    origins=exclusive_origin_ids({h.get('OriginId') for h in heroes})
    names={a['Name'] for a in actions}
    # Weapon-driven actions require the chosen equipment's projectile and timing.
    driven=bool({n.split(':',1)[0] for n in names} & {'ManualRifle','ManualChargeBow'})
    compatible={v for h in heroes for values in (h.get('CompatibleWeapons') or {}).values() for v in values}
    return [w for w in items if w.get('Type')=='weapon' and
            ((w.get('SuperBattleAction') in names and w.get('ExclusiveCharacterId') in origins) or
             (driven and w.get('WeaponType') in compatible and w.get('SortingNumber',0)>=0))]

def weapon_metadata(rows,origins):
    eligible=exclusive_origin_ids(origins);result={}
    for w in sorted(rows,key=lambda w:(w.get('WeaponType')!='custom',w.get('SortingNumber',0)>=0,w.get('Rarity',0),w['Id'])):
        sprite=w.get('SpriteName') or {};names=[sprite] if isinstance(sprite,str) else sprite.values()
        for name in names:
            result[name]=dict(action=w.get('SuperBattleAction'),optionIds=[o['OptionId'] for o in w.get('StaticOptions',[])],
                 shootOffset=w.get('ShootOffset'),shootTerm=w.get('ShootTerm'),magazineSize=w.get('MagazineSize'),reloadTime=w.get('ReloadTime'),length=w.get('Length'),
                 projectile=w.get('Projectile'),superProjectile=w.get('SuperProjectile'),weaponType=w.get('WeaponType'),
                 columns=w.get('Columns',1),parallel=w.get('Parallel',True),spreadAngle=w.get('SpreadAngle',90),spreadDistance=w.get('SpreadDistance',.2),
                 exclusive=w.get('ExclusiveCharacterId') in eligible,exclusiveNumber=w.get('ExclusiveNumber'),sourceItemId=w['Id'])
    return result

def materialize_sprite_projectiles(manifest,projectiles,required=True):
    """Bind source ProjectileSpec.SpriteName/P2w to the actual pooled CustomSprite.
    A derived renderer is an instance of the original template plus source fields;
    original static tables remain intact and the derivation is recorded explicitly.
    """
    import copy,hashlib,json
    templates={e['preset']:e for e in manifest['effects'] if e['preset'] in ['FX_single_projectile','FX_normal_arrow']}
    source=templates.get('FX_single_projectile')
    scripts=[s for s in (source or {}).get('scripts',[]) if s.get('type')=='CustomSprite' and s.get('customSpriteSource')]
    if not scripts:
        if required:raise ValueError('Weapon projectile source template is missing its native CustomSprite atlas contract')
        return projectiles
    out=[]
    for original in projectiles:
        p=dict(original)
        if not p.get('SpriteName') or p.get('PresetName'):out.append(p);continue
        preset='native_projectile_sprite:'+p['Name'];effect=copy.deepcopy(source)
        effect.update(id=manifest['character']+':'+preset,preset=preset,label=preset,assetName=source['assetName'],
                      nativeProjectileSprite={'projectile':p['Name'],'pool':'FX_single_projectile','SpriteName':p['SpriteName'],'P2w':p.get('P2w'),
                          'sourceSha256':hashlib.sha256(json.dumps(original,sort_keys=True).encode()).hexdigest()})
        for script in effect['scripts']:
            atlas=script.get('customSpriteSource')
            if not atlas:continue
            name=p['SpriteName'];frames=atlas['frames']
            if name not in frames and atlas['ignoreExtension'] and '.' in name:name=name.rsplit('.',1)[0]
            missing_frame=None
            if name not in frames:
                # Same-version SingleTargetHeal:Weak consumes this exact legacy
                # registry sprite, absent from the APK projectiles atlas. Native
                # CustomAtlas.GetRect (0x67d7be0, miss path 0x67d7cbc) returns
                # Rect.zero after both exact and extension-less lookup fail.
                # Preserve the native zero-area body; never borrow another heart.
                if p['Name']=='heal_shot_metal_heart' and p['SpriteName']=='heal_shot_metal_heart.png' and atlas['ignoreExtension']:
                    missing_frame=dict(sprite=p['SpriteName'],lookupKey=name,atlasKey=atlas['atlasKey'],fallback='native-zero-rect',
                        source='CustomAtlas.GetRect 0x67d7be0 / miss return 0x67d7cbc-0x67d7cd8',sourceSha256=ELF)
                    frame=dict(frame=dict(x=0,y=0,w=0,h=0),sourceSize=dict(w=0,h=0),spriteSourceSize=dict(x=0,y=0,w=0,h=0),rotated=False)
                    effect['nativeMissingAtlasFrame']=missing_frame;p['nativeMissingAtlasFrame']=missing_frame
                else:raise ValueError('Missing native projectile atlas sprite '+p['SpriteName'])
            else:frame=frames[name]
            rect=frame['frame'];extent=atlas['atlasSize'];size=frame['sourceSize'];trim=frame.get('spriteSourceSize',size)
            p2w=p.get('P2w',atlas['pixelToWorld']);scale=atlas['localScale'];sprite_key='native-projectile:'+atlas['atlasKey']+':'+name+':'+str(p2w)
            manifest['sprites'][sprite_key]=dict(name=p['SpriteName'],texture=atlas['material']['texture'],uv=[rect['x']/extent['w'],1-(rect['y']+rect['h'])/extent['h'],rect['w']/extent['w'],rect['h']/extent['h']],
                size=[size['w'],size['h']],pivot={'x':.5,'y':.5},pixelsToUnits=1/p2w,rotated=frame.get('rotated',False),atlasFrame=frame)
            node=script['node'];effect['statics']=[r for r in effect.get('statics',[]) if r['node']!=node]
            effect['statics'].append(dict(node=node,name='NativeProjectileSprite',mesh=None,sprite=sprite_key,
                size=[trim['w']*p2w*scale['x'],trim['h']*p2w*scale['y']],material=copy.deepcopy(atlas['material']),sort=script['fields'].get('SortingOrder',0),
                customSprite=dict(atlasFrameKey=name,ignoreExtension=atlas['ignoreExtension'],pixelToWorld=p2w,ignoreOriginalSize=atlas['ignoreOriginalSize'],localScale=scale)))
            script['fields']['SpriteName']=p['SpriteName'];script['fields']['PixelToWorld']=p2w
        manifest['effects']=[e for e in manifest['effects'] if e['preset']!=preset];manifest['effects'].append(effect)
        charge=copy.deepcopy(effect);charge_preset='native_projectile_charge:'+p['Name'];charge.update(id=manifest['character']+':'+charge_preset,preset=charge_preset,label=charge_preset)
        for item in charge['statics']:
            atlas=next((s['customSpriteSource'] for s in charge['scripts'] if s.get('node')==item['node'] and s.get('customSpriteSource')),None)
            if not atlas or not item.get('customSprite'):continue
            ratio=atlas['pixelToWorld']/item['customSprite']['pixelToWorld'];item['size']=[v*ratio for v in item['size']];item['customSprite']['pixelToWorld']=atlas['pixelToWorld']
        for item in [effect,charge]:
            for script in item['scripts']:script.pop('customSpriteSource',None)
        manifest['effects']=[e for e in manifest['effects'] if e['preset']!=charge_preset];manifest['effects'].append(charge)
        p.update(PresetName=preset,nativeChargePreset=charge_preset,nativeSpriteTemplate='FX_single_projectile');out.append(p)
    return out
