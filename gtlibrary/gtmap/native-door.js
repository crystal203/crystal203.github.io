/** Oak.DoorBehaviour constructor 0x6307e04..0x6307f84, authenticated ARM64.
 * UpdateState 0x630432c: entering Opening reads +0xc8, Closing reads +0xd0.
 * These are separate from MonsterLockGateBehaviour's show/destroy sounds.
 */
export function nativeDoorSounds(fields,open){
 const sound=open?(fields.DoorOpenSfxHandleName??'02_gimmick_door_down_01'):(fields.DoorCloseSfxHandleName??'02_gimmick_door_up_01');
 return [open&&fields.IsPlayJingle?(fields.GimmickJingleSfxHandleName??'03_gimmick_jingle_01'):null,sound].filter(Boolean);
}
