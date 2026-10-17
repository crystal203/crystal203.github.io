/** Field items are capabilities, not story completion flags or collected objects. */
export const FIELD_ITEMS=Object.freeze([
 Object.freeze({id:30017,name:'鼹鼠拳套',icon:'item-30017.png',capability:'gloves',description:'可击碎挡路的小岩石。'})
]);
export function normalizeLoadout(items){return FIELD_ITEMS.filter(item=>Array.isArray(items)&&items.includes(item.id)).map(item=>item.id);}
export function hasCapability(state,name){return state.flags.includes(name)||FIELD_ITEMS.some(item=>item.capability===name&&state.loadout?.includes(item.id));}
