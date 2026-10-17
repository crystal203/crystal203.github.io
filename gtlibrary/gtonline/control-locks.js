// Oak.DisabledControls, decoded from the pinned native field defaults.
export const Controls=Object.freeze({Move:1,Dash:2,Attack:4,Super:8,Assassination:16,PartySupportBattleAction:32,Throw:64,Hold:128,Interact:256,All:511});
export class NativeControlLocks{
 constructor(){this.requests=new Map();}
 request(owner,mask){this.requests.set(owner,mask);}
 release(owner){this.requests.delete(owner);}
 allows(control){let mask=0;for(const value of this.requests.values())mask|=value;return !(mask&Controls[control]);}
}
