"""Fixed projectile references from native firearm constructors, not equipment."""
NATIVE_FIREARM_PROJECTILES={
    'ManualHealShotgun':('manual_heal_shotgun_projectile',),
    'ManualRecoveryBow':('manual_fairy_damage_projectile',),
    # Oak.ManualWeakBasket constructor 0x8b0d2d4.
    'ManualWeakBasket':('weak_basket_shot',),
    # Oak.MachineGunArrow constructor 0x8ac1fac, same-version ARM64.
    'MachineGunArrow':('machinegun_arrow',),
    'ManualPistol':('manual_pirate_default_projectile','manual_pirate_super_projectile'),
    'ManualSniperRifle':('sniper_proj_mode1','sniper_proj_mode2'),
}

def native_firearm_projectile_names(actions):
    """Return a set of registry names from an iterable of BattleAction row dicts."""
    return {name for action in actions for name in NATIVE_FIREARM_PROJECTILES.get(action.get('Name','').split(':')[0],())}
