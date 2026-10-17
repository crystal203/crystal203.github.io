"""Strict compiler for the recovered legacy Screenplay JSON operation subset.

Stage callbacks are injected by the stage builder. Unknown operations fail.
"""
import copy
import struct
def single(value):return struct.unpack('<f',struct.pack('<f',value))[0]
LOWERED_OPERATIONS=frozenset(['find','wait','do','sequence','direction','focus_camera','jump','animation',
    'remove_animation','emotion','remove_emotion','talk','play_sfx','call','await','position','activate','fade_in','custom_action'])
OPTION_KEYS={'focus_camera':{'position','duration','wait'},'jump':{'height','duration','wait'},
    'animation':{'name','repeat','wait','sfx_name'},'emotion':{'name','repeat'},
    'talk':{'code','en_us','type_speed','stay_time','skip','no_wait','portrait'},'play_sfx':{'name'},'custom_action':{'name','args'}}

class ScreenplayCompiler:
    def __init__(self,stage,callbacks=None,custom_actions=None):
        self.stage=stage;self.callbacks=callbacks or {};self.custom_actions=custom_actions or {}
        self.aliases={};self.used=set();self.commands=[];self.time=0

    def emit(self,op,target=None,**values):
        command=dict(at=self.time,op=op,**values)
        if target is not None:command['target']=target;self.used.add(target)
        self.commands.append(command)

    def walk(self,node,target=None,mode=None):
        if isinstance(node,list):
            for value in node:self.walk(value,target)
            return
        if not isinstance(node,dict):raise ValueError('Expected Screenplay operation object')
        start=self.time;end=start
        for operation,value in node.items():
            if mode!='sequence':self.time=start
            if isinstance(value,dict) and operation in OPTION_KEYS:
                unknown=set(value)-OPTION_KEYS[operation]
                if unknown:raise ValueError('Unsupported native parameters for '+operation+': '+', '.join(sorted(unknown)))
            if operation.startswith('$'):
                alias=operation.split(' ')[0]
                if operation not in [alias,alias+' sequence']:raise ValueError('Unsupported actor syntax: '+operation)
                if isinstance(value,dict) and 'find' in value:
                    handle='leader' if value['find']=='player' else value['find']
                    if handle not in self.stage['actors']:raise ValueError('Missing native actor: '+handle)
                    self.aliases[alias]=handle
                if alias not in self.aliases:raise ValueError('Unbound native actor: '+alias)
                self.walk(value,self.aliases[alias],mode='sequence' if operation.endswith(' sequence') else None)
            elif operation=='find':
                if target is None:raise ValueError('Find requires actor scope')
            elif operation=='wait':self.time+=single(value)
            elif operation=='position':self.emit('teleport',target,position=[single(v) for v in value])
            elif operation=='activate':self.emit('visible',target,value=bool(value))
            elif operation=='fade_in':
                if value['name'] not in ['circle','black']:raise ValueError('Unsupported native fade: '+value['name'])
                duration=single(value['duration']);self.emit('screen',value=0,duration=duration,circle=value['name']=='circle');self.time+=duration
            elif operation=='do':
                self.walk(value,target,mode='parallel')
            elif operation=='sequence':self.walk(value,target,mode='sequence')
            elif operation=='direction':
                if value=='lock':raise ValueError('Native direction lock requires a runtime actor-state binding')
                directions=dict(up='back',down='front',left='left',right='right')
                if value not in directions:raise ValueError('Unknown native direction: '+value)
                self.emit('pose',target,direction=directions[value])
            elif operation=='focus_camera':
                duration=single(value['duration']);p=value['position']
                if isinstance(p,str):
                    handle=self.aliases[p];self.used.add(handle)
                    self.emit('camera',position=self.stage['actors'][handle]['position'],follow=handle,duration=duration)
                else:self.emit('camera',position=[single(v) for v in p],duration=duration)
                # ScreenplayFocusCamera.Parse defaults wait=true (88bd440).
                if value.get('wait',True):self.time+=duration
            elif operation=='jump':
                duration=single(value['duration']);self.emit('jump',target,height=single(value['height']),duration=duration,nativeJump=True)
                if value.get('wait',True):self.time+=duration
            elif operation=='animation':
                options=value if isinstance(value,dict) else dict(name=value)
                if options.get('wait',False):raise ValueError('Animation completion requires native clip duration')
                self.emit('pose',target,animation=options['name'],loop=options.get('repeat','repeat')!='once',keep=True)
                if options.get('sfx_name'):self.emit('sound',name=options['sfx_name'])
            elif operation=='remove_animation':
                self.emit('pose',target,animation=self.stage['actors'][target].get('animation','idle'),loop=True)
            elif operation=='emotion':
                options=value if isinstance(value,dict) else dict(name=value)
                self.emit('pose',target,expression=options['name'],expressionLoop=options.get('repeat','repeat')!='once',nativePriority=10)
            elif operation=='remove_emotion':
                self.emit('pose',target,expression=self.stage['actors'][target].get('expression','idle'),expressionLoop=True)
            elif operation=='talk':
                if value.get('no_wait',False):raise ValueError('Concurrent native speech bubbles require the IR runtime scheduler')
                code=value['code'];text=self.stage['strings'].get(code)
                if text is None:raise ValueError('Missing localized native dialogue: '+code)
                # ScreenplayObjectTalk.Parse: .05 type speed, stay_time=2,
                # skip=true -> SpeechBubbleGenerateParam.ClickToProceed=true.
                speed=single(value.get('type_speed',.05));stay=single(value.get('stay_time',2))
                duration=len(text.encode('utf-16-le'))/2*speed+stay
                self.emit('dialogue',target,text=text,code=code,duration=duration,typeSpeed=speed,
                          waitForClick=value.get('skip',True),nativeStayTime=stay,nativeTypewriter=True)
                if not value.get('no_wait',False):self.time+=duration
            elif operation=='play_sfx':
                name=value['name'] if isinstance(value,dict) else value
                if not isinstance(name,str) or not name:raise ValueError('Native Sfx name cannot be empty')
                self.emit('sound',name=name)
            elif operation in ['call','await']:
                if value not in self.callbacks:raise ValueError('Unbound native callback: '+value)
                self.callbacks[value](self)
            elif operation=='custom_action':
                name=value['name']
                if name not in self.custom_actions:raise ValueError('Unbound native custom action: '+name)
                self.custom_actions[name](self,target,value.get('args'))
            else:raise ValueError('Unsupported native operation: '+operation)
            end=max(end,self.time)
        if mode!='sequence':self.time=end

    def compile(self,source,key,source_path):
        self.walk(source.get('setting',[]));self.walk(source[key])
        talks=sorted((c for c in self.commands if c['op']=='dialogue'),key=lambda c:c['at'])
        if any(a['at']+a['duration']>b['at']+1e-9 for a,b in zip(talks,talks[1:])):
            raise ValueError('Concurrent native speech bubbles require the IR runtime scheduler')
        return dict(version=1,map=self.stage['map'],id=self.stage['stageName']+':'+key,
                    title=key,actors=[copy.deepcopy(self.stage['actors'][h]) for h in sorted(self.used)],
                    commands=self.commands,duration=self.time,blocking=True,preservePositions=True,
                    waitForDialogue=True,source=source_path+':'+key)

