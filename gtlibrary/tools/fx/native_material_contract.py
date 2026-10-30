"""Fail closed on incomplete blending or unresolved texture bindings.
This validates source contracts, not visual equivalence of arbitrary shaders.
"""
import re

def supported_shader(name):
    return bool(re.fullmatch(r'Mobile/Particles/(?:Additive|Alpha Blended)(?: Top)?(?: Shear| Z Test)?',name) or
        re.fullmatch(r'Effect/Mask_(?:Additive_(?:Tint|Blend)|Alphablend_Tint)(?:_2Tex)?(?:_Top)?(?:_Shear)?',name) or
        re.fullmatch(r'MatCap/Detail(?: Y Gradation(?: UpDown)?| Alpha(?: ZWrite| UV)?| UV)?',name) or
        name in {'Effect/Mobile_Additive_Color','Effect/Mobile_Additive_Color_Top','Effect/Mobile_AlphaBlend','Effect/Mobile_AlphaBlend_Top',
        'Effect/TwoSidedDissolve_1pass_cvs','Effect/TwoSidedDissolve_1pass_cvs_top','Effect/TwoSidedDissolve_2pass_cvs','Effect/Screen/CA_BW_Distort','Effect/Screen/PP_CABWDB',
        'Unlit/Transparent','Unlit/Transparent Additive Bend','Unlit/Transparent Color Bend','Unlit/Transparent Color Bend Shear','Unlit/Shadow','Unlit/Texture','Unlit/Premultiplied Colored','Unlit/Transparent Colored','Unlit/Transparent Cutout','Unlit/Transparent Tint','Particles/Standard Unlit',
        'Legacy Shaders/Particles/Additive (Soft)','MatCap/Partly Visible','Spine/SkeletonGhost Character','Legacy/Particles/Additive Shear','Mobile/Unlit (Supports Lightmap)','Effect/BasicBlend_Tint_Side'})

def blend_mode(pair):
    if list(pair)==[1,0]:return 'opaque'
    if pair[0] not in (1,2,3,5) or pair[1] not in (1,6,10):
        raise ValueError(f'Unsupported native blend factors: {pair}')
    return 'add' if pair[1]==1 else 'alpha'

def effect_materials(effect):
    for system in effect.get('systems',[])+effect.get('statics',[]):
        if system.get('emitterOnly'):continue
        for mat in [system.get('material'),system.get('trailMaterial'),*(system.get('materials') or [])]:
            if mat:yield mat

def material_issues(mat,index):
    # No source material: explicitly generated untextured vertex-color fallback.
    if mat.get('name')=='white' and not mat.get('texture'):return []
    errors=[]
    if not mat.get('shader'):errors.append('missing native shader')
    elif not supported_shader(mat['shader']):errors.append('unsupported native shader '+mat['shader'])
    pair=mat.get('nativeBlend')
    if not pair:errors.append('missing native blend factors')
    else:
        try:
            if mat.get('blend')!=blend_mode(pair):errors.append('blend classification differs from native factors')
        except ValueError as error:errors.append(str(error))
    refs=[mat.get('texture'),mat.get('matcap')]+[mat.get(k,{}).get('texture') for k in ('mask','texture2')]+list(mat.get('textureBindings',{}).values())
    for ref in refs:
        if ref and ref not in index['textures']:errors.append('missing texture '+ref)
    shader=mat.get('shader','')
    if 'Mask_' in shader and not mat.get('mask'):errors.append('missing mask binding')
    if mat.get('mask') and not mat['mask'].get('texture') and mat['mask'].get('defaultTexture')!='white':errors.append('unresolved default mask')
    if '2Tex' in shader and not mat.get('texture2'):errors.append('missing second texture binding')
    if shader in ('Effect/Mask_Additive_Tint_2Tex','Effect/Mask_Additive_Tint_2Tex_Top','Effect/Mask_Additive_Blend_2Tex','Effect/Mask_Additive_Blend_2Tex_Top') and mat.get('colorGain')!=4:
        errors.append('native two-texture RGBA multiplier must be 4')
    if shader in ('Unlit/Transparent Color Bend Shear','Unlit/Transparent Color Bend','Unlit/Transparent Additive Bend'):
        if mat.get('nativeBend',{}).get('variant')!='bend-no-shear':errors.append('missing supported native bend vertex contract')
        if not mat.get('textureAlphaMultiplier'):errors.append('native bend color requires a second texture-alpha multiplier')
        if mat.get('scale')!={'x':1,'y':1} or mat.get('offset')!={'x':0,'y':0}:errors.append('native bend color must use raw UV')
    if shader=='Legacy Shaders/Particles/Additive (Soft)' and mat.get('nativeSoftAdditive',{}).get('variant')!='SOFTPARTICLES_OFF':errors.append('missing native soft-particle keyword variant')
    if shader=='Unlit/Transparent':
        if mat.get('nativeUnlitTexture',{}).get('version')!=1 or not mat.get('ignoreVertexColor') or mat.get('colorGain')!=1 or mat.get('tint')!={'r':1,'g':1,'b':1,'a':1}:errors.append('missing exact unlit texture-only fragment contract')
    if shader=='MatCap/Partly Visible':
        if mat.get('nativePartlyVisibleContract',{}).get('position')!='object-space' or mat.get('matcapRgbGain')!=3 or not mat.get('ignoreVertexColor'):errors.append('missing exact partly-visible object distance/RGB contract')
    if shader=='Spine/SkeletonGhost Character' and mat.get('nativeSkeletonGhostContract',{}).get('version')!=1:errors.append('missing skeleton ghost fade/alpha-squared contract')
    if shader=='Unlit/Shadow':
        if mat.get('nativeShadowContract',{}).get('variant')!='no-shear':errors.append('missing supported native shadow variant contract')
        if not mat.get('ignoreVertexColor') or mat.get('colorGain')!=1:errors.append('native shadow must sample texture times Color without vertex color')
        if mat.get('scale')!={'x':1,'y':1} or mat.get('offset')!={'x':0,'y':0}:errors.append('native shadow uses raw UV without MainTex_ST')
        if mat.get('nativeBlend')!=[5,10] or mat.get('depthWrite') or mat.get('cull')!='back':errors.append('native shadow pass state differs from source')
    if shader=='Effect/TwoSidedDissolve_2pass_cvs':
        from native_dissolve import contract_issues
        errors.extend(contract_issues(mat))
    if shader.startswith('Effect/Screen/') and not (mat.get('surface')=='screenDistortion' and mat.get('fragmentSource')):errors.append('missing native screen fragment')
    return errors

def effect_render_issues(effect,index):
    """Require actual renderer output for enabled, authored atlas sprites.

    Empty/dynamic CustomSprite names and ordinary script-only controllers are
    not visible source geometry and must not be rejected as empty effects.
    """
    errors=[]
    for system in effect.get('systems',[]):
        if system.get('renderer',{}).get('enabled') is False and not system.get('emitterOnly'):errors.append('disabled native ParticleSystemRenderer must remain emitter-only: '+str(system.get('sourceId')))
    for script in effect.get('scripts',[]):
        fields=script.get('fields',{});atlas=fields.get('Atlas') or {}
        if script.get('type')=='StageShadowSetter' and fields.get('m_Enabled',1):
            node_ids={n['id'] for n in effect.get('nodes',[])}
            for field,key in [('Body','bodyNode'),('Shadow','shadowNode')]:
                source=fields.get(field) or {}
                if str(source.get('m_PathID',0))!='0' and script.get(key) not in node_ids:
                    errors.append('missing StageShadowSetter Transform->GameObject binding: '+field+' / '+str(script.get('node')))
        if script.get('type')!='CustomSprite' or not fields.get('m_Enabled',1):continue
        if not fields.get('SpriteName') or str(atlas.get('m_PathID',0))=='0':continue
        rendered=[s for s in effect.get('statics',[]) if s.get('node')==script.get('node') and s.get('customSprite')]
        if not rendered:errors.append('missing enabled CustomSprite renderer: '+str(script.get('node'))+' / '+fields['SpriteName'])
        for item in rendered:
            sprite=index.get('sprites',{}).get(item.get('sprite'))
            if not sprite:errors.append('missing CustomSprite atlas frame: '+str(item.get('sprite')))
            elif not sprite.get('texture') or sprite['texture'] not in index.get('textures',{}):errors.append('missing CustomSprite atlas texture: '+str(item.get('sprite')))
    return errors


def validate_materials(index,presets):
    errors=[];materials=0;effects=0
    for effect in index['effects']:
        if effect['preset'] not in presets or effect.get('unavailable'):continue
        effects+=1
        errors.extend(effect['preset']+' / '+issue for issue in effect_render_issues(effect,index))
        for mat in effect_materials(effect):
            materials+=1
            errors.extend(f"{effect['preset']} / {mat.get('name')}: {issue}" for issue in material_issues(mat,index))
    if errors:raise ValueError('Material acceptance blocked:\n'+'\n'.join(errors[:30]))
    return {'version':1,'passed':True,'effects':effects,'materials':materials,'scope':'action dependencies','visualValidation':False}

