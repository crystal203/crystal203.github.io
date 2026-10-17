"""1-2 source dependencies and native-only callbacks. No common parser code."""
import struct
EVENTS=['StageEventSealedKingdom','ButterflyGuide','BurningSkull','PetNew','ForestMainNew']
STRING_PREFIXES=['super_tutorial','butterfly','burningskull','stage_event_forest_1_2','pet_talk','pet_script','stage_1_2_vampireidol','forest_main_s8']
SCREENPLAYS={'sealed_kingdom':{'resource':'StageEventSealedKingdom','section':'sealed_kingdom',
    'evidence':'StageEventControllerSealedKingdom registered methods; native-spine-motion.json'}}
def single(v):return struct.unpack('<f',struct.pack('<f',v))[0]

def bindings(stage):
    motion=stage['nativeMechanics']['spineMotion'];boy=motion['sealedBoyDamage']
    def deviate(compiler,target,args):
        offset,duration,clear=args;duration=single(duration);clear=single(clear)
        compiler.emit('deviate',target,offset=[single(v) for v in offset],
                      deviateDuration=duration,clearDuration=clear,duration=duration+clear)
    def damaged(compiler):
        target='kid_boy'
        compiler.emit('squish',target,**{k:boy[k] for k in ['broad','narrow','frequency','duration','firstAnchor','secondAnchor']})
        compiler.emit('colorPulse',target,color=motion['damageColor']['value'],frequency=1,magnitude=1,duration=boy['duration'],anchor=.5)
        compiler.emit('sound',name='01_hit_comic_01')
        compiler.emit('pose',target,animation='damaged',loop=False,keep=True,nativePriority=10)
        compiler.emit('deviate',target,offset=boy['deviation'],deviateDuration=boy['deviateDuration'],clearDuration=boy['clearDuration'],duration=boy['deviateDuration']+boy['clearDuration'])
        compiler.emit('shake',target,radius=boy['shakeRadius'],duration=boy['shakeDuration'])
    return {'KidBoyDamaged':damaged},{'deviate':deviate}
