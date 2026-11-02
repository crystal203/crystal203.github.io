// Public authoring vocabulary; clients discover IDs and choices instead of
// copying renderer internals or inventing skeleton/asset payloads.
export const operationGuide={
 'shot.create':{required:['name','frames'],optional:['ref'],example:{op:'shot.create',ref:'s',name:'用户的第一镜',frames:120}},
 'shot.update':{required:['shot'],optional:['name','frames']},
 'map.set':{required:['shot','resource'],optional:['includeCharacters','replace'],note:'resource 来自 map 搜索；已有地图/对象时必须明确 replace:true。'},
 'actor.add':{required:['shot','resource','anchorObjectId'],optional:['ref','name','offset','settings','instantiate'],settings:['direction','animation','skin','expression','sub','equipment','alpha','speed','loop'],note:'resource 来自 character 搜索。默认实例化并建立全部轨道；ref 返回实例 ID。'},
 'item.add':{required:['shot','resource','anchorObjectId'],optional:['ref','name','offset','instantiate'],note:'resource 来自 item 搜索；坐标相对于基准对象。'},
 'object.instantiate':{required:['shot','object'],optional:['ref','name'],note:'object 来自 query(objects)；ref 返回实例 ID。'},
 'camera.set':{required:['shot','frame','settings'],settings:['position','target','span','near','far','nativeProjection','lookAtObjectId','offset'],note:'position/target 为 GTVideo 坐标。取景同时写入位置关键帧与 viewOffset。推荐 lookAtObjectId 指定实例、offset 指定视角向量以避免坐标转换错误。'},
 'key.set':{required:['shot','target','property','frame','value'],optional:['ref','ease','bezier','trajectory','viewOffset'],note:'target 为实例 ID 或 camera；value 为数值或三维向量。ref 返回关键帧 ID；trajectory.to 可以引用批中较早创建的右端关键帧。'},
 'key.remove':{required:['shot','target','property','frame']},
 'track.audio':{required:['shot'],optional:['ref','target','name','volume'],note:'target 默认为 audio，也可以是人物实例 ID；ref 返回音轨 ID。'},
 'track.update':{required:['shot','track','settings'],settings:['name','enabled','collapsed','volume','waveform'],note:'volume/waveform 仅限音轨。'},
 'segment.add':{required:['shot','frame','frames'],optional:['ref','target','property','track','resource','group','data'],note:'track 或 target+property 二选一；audio 必须给 resource，默认使用集合第一条音轨。开始位置不依赖网页播放头。',data:{state:'{value,loop,speed,in,mix}，动作名来自 choices；in 为秒。',equipment:'{value:{"装备槽位":数字物品ID}}，0 表示卸下。',dialogue:'{text,bubbleType,speaker,typeSpeed,scale,screen,narration,emotion,emotionItem}；支持富文本。',fx:'{character,module,appearance,target,targetOffset,secondary,takeover,actor,screenfx,speed,in,continueFx}；character/module 来自 fx/choices/fxModules。',audio:'{in,volume,fadeIn,fadeOut,speed}，淡入淡出为秒。',gimmick:'{group,value,still,speed,in}，来自 choices.gimmicks。',cameraEffect:'{effect,strength,color,amount,frequency,radius,soft,speed}。'}},
 'segment.update':{required:['shot','track','segment'],optional:['frame','frames','data']},
 'segment.move':{required:['shot','track','segment'],optional:['frame','toTrack'],note:'toTrack 仅用于同集合音轨，未指定 frame 时保留时间位置。'},
 'segment.split':{required:['shot','track','segment','frame'],optional:['ref']},
 'segment.merge':{required:['shot','track','segments'],optional:['ref'],note:'必须同轨相邻；新区间继承最左侧数据。'},
 'segment.remove':{required:['shot','track','segment']},
 'cut.add':{required:['shot','frame'],optional:['ref','inFrame','outFrame','settings'],settings:['rate','layer','opacity','volume','muted','transitionIn','transitionOut']},
 'cut.update':{required:['cut'],optional:['frame','inFrame','outFrame','settings']},
 'cut.remove':{required:['cut']}
};
