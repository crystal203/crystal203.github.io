-- Offline recorder. The caller supplies a sandbox environment with no host IO.
local E, bridge = ...
local clock, tasks, serial, notices, choices, used = 0, {}, 0, {}, {}, {}
local function notice(name) notices[name] = (notices[name] or 0) + 1 end
local function emit(op, target, data) bridge('emit',clock,op,target,data or {}) end
local instructions=0
local function instruction_hook() instructions=instructions+10000;if instructions>3000000 then error('instruction limit')end end
local function spawn(fn,...)
 local args={...};serial=serial+1;local co=coroutine.create(function() fn(table.unpack(args)) end);debug.sethook(co,instruction_hook,'',10000);tasks[#tasks+1]={at=clock,id=serial,co=co}
end
local function sleep(dt) dt=tonumber(dt) or 0;if dt<0 or dt>3600 then error('invalid wait') end;coroutine.yield(dt) end
local vector_mt={}
local function vec(x,y,z) return setmetatable({x=x or 0,y=y or 0,z=z or 0,__vector=true},vector_mt) end
vector_mt.__add=function(a,b)return vec(a.x+b.x,a.y+b.y,a.z+b.z)end
vector_mt.__sub=function(a,b)return vec(a.x-b.x,a.y-b.y,a.z-b.z)end
vector_mt.__unm=function(a)return vec(-a.x,-a.y,-a.z)end
vector_mt.__mul=function(a,b)if type(a)=='number' then return vec(a*b.x,a*b.y,a*b.z)end;return vec(a.x*b,a.y*b,a.z*b)end
vector_mt.__div=function(a,b)return vec(a.x/b,a.y/b,a.z/b)end
vector_mt.__index=function(t,k)if k=='normalized' then local n=math.sqrt(t.x*t.x+t.y*t.y+t.z*t.z);return n>0 and t/n or vec()elseif k=='magnitude' then return math.sqrt(t.x*t.x+t.y*t.y+t.z*t.z)end end
local proxy
proxy=function(path)
 return setmetatable({__proxy=path},{__index=function(_,k)return proxy(path..'.'..tostring(k))end,__call=function(_,...)notice(path);return proxy(path..'()')end,__add=function(a,b)notice(path..':numeric');return 0 end,__sub=function(a,b)notice(path..':numeric');return 0 end,__mul=function(a,b)notice(path..':numeric');return 0 end,__tostring=function()return path end})
end
local actors, dynamic, moves = {}, {}, {}
local function moving_position(obj)
 local m=moves[obj.__actor];if not m then return obj._pos end
 local u,distance=math.min(1,math.max(0,(clock-m.start)/(m.at-m.start))),0
 for i,p in ipairs(m.points)do local a=i==1 and m.from or m.points[i-1];distance=distance+(p-a).magnitude end
 local remaining=u*distance
 for i,p in ipairs(m.points)do local a=i==1 and m.from or m.points[i-1];local d=(p-a).magnitude;if remaining<=d then return a+(p-a)*(d>0 and remaining/d or 1)end;remaining=remaining-d end
 return m.points[#m.points]
end
local function actor(handle,kind)
 if type(handle)~='string' then error('unresolved actor handle') end
 if actors[handle] then return actors[handle] end
 local info=bridge('actor',handle,dynamic[handle],kind or 'character')
 local p=info and info.position or {};local obj={__actor=handle,__kind=kind or 'character',_pos=vec(p[1],p[2],p[3]),_direction=info and info.direction or 'front',_anim=false}
 actors[handle]=obj
 local function pose(data)emit('pose',handle,data)end
 obj.SpineController=setmetatable({SetSortingLayer=function(_,layer,order)pose({sortingLayer=layer,sortingOrder=order or 0})end},{__index=function(_,k)return proxy(handle..'.SpineController.'..k)end})
 obj.GetComponent=function(_,component)if obj.__kind=='field' and tostring(component)=='CS.UnityEngine.Animator' then return {Play=function(_,state,layer,normalized)if normalized and normalized~=0 and normalized~=1 then notice('partial animator normalized time:'..state)end;emit('gimmick',handle,{state=state,still=normalized==1})end}end;return proxy(handle..'.GetComponent:'..tostring(component))end
 obj.transform=setmetatable({}, {__index=function(_,k)if k=='position' or k=='localPosition' then return obj._pos end;return proxy(handle..'.transform.'..k)end,__newindex=function(_,k,v)if k=='position' or k=='localPosition' then obj.Position=v else notice(handle..'.transform.'..k)end end})
 setmetatable(obj,{__index=function(_,k)
  if k=='Position' or k=='position' then return moving_position(obj) elseif k=='Direction' then return obj._direction elseif k=='Name' or k=='name' then return handle end
  if k=='SetDirection' then return function(_,d)obj.Direction=d end elseif k=='RemoveAnim' then return function()pose({animation='idle',loop=true})end elseif k=='RemoveEmotion' then return function()pose({expression='idle'})end end
  return proxy(handle..'.'..tostring(k))
 end,__newindex=function(_,k,v)
  if k=='Position' or k=='position' then if not (type(v)=='table' and rawget(v,'__vector')==true) then error('unresolved position '..handle) end;obj._pos=v;emit('teleport',handle,{position=v})
  elseif k=='Direction' then obj._direction=v;pose({direction=v}) else rawset(obj,k,v)end
 end})
 return obj
end
local function id(a)if type(a)~='table' or type(rawget(a,'__actor'))~='string' then error('unresolved character')end;return rawget(a,'__actor') end
local function animdata(args,kind,holder)
 local supplied=type(args)=='string' and {name=args} or args or {};local a={};local defaults=holder==false and {} or bridge('animation-preset',supplied.name,kind or 'anim',type(holder)=='table' and rawget(holder,'scene_version') or 1)
 for k,v in pairs(defaults or {})do a[k]=v end;for k,v in pairs(supplied)do a[k]=v end;return a
end
local function animation(fo,args,blocking,holder)
 local a,h=animdata(args,nil,holder),id(fo);local d=bridge('duration',h,a.name or 'idle',fo.Direction)* (tonumber(a.count) or 1) / (tonumber(a.scale) or 1)
 local bounded=a.count or a.loop==false or a.remove_after;local data={animation=a.name or 'idle',loop=a.count and a.count>1 or not a.count and a.loop~=false,keep=a.keep_anim==true or not blocking and a.loop==false and not a.count and not a.remove_after,animationSpeed=a.scale or 1}
 if bounded then data.duration=tonumber(a.remove_after) or d end
 emit('pose',h,data);if blocking then if bounded then sleep(data.duration or d)end;if not a.keep_anim then fo._anim=false;emit('pose',h,{animation='idle',loop=true,animationSpeed=1})end end
end
local function emotion(fo,args,holder)local a=animdata(args,'emotion',holder);emit('pose',id(fo),{expression=a.name or 'idle',expressionLoop=a.loop~=false})end
local function direction(fo,d)if type(d)=='table' then d=d.name or d.direction or d.dir end;fo.Direction=d end
local function speech(fo,args,kind)
 local a=type(args)=='string' and {key=args} or args or {};local key=a.key;if type(key)=='table' then key=key[1]end
 if not key then error('unresolved speech key')end
 local text=bridge('text',key);local dt=tonumber(a.life_time) or math.max(1.5,utf8.len(text)*.075+1)
 emit('dialogue',id(fo),{text=text,stringKey=key,duration=dt,bubbleType=kind or 'talk',bubbleDirection=a.bubble_direction,typeSpeed=a.type_speed,viewportPosition=a.viewport_pos and {a.viewport_pos.x,a.viewport_pos.y},scale=tonumber(a.scale)});sleep(dt)
end
local function speech_action(fo,holder,dir,a,emo,s,kind)
 if dir~=nil then direction(fo,dir)end;if a~=nil then animation(fo,a,false,holder)end;if emo~=nil then emotion(fo,emo,holder)end
 speech(fo,s,kind)
 if a~=nil and not animdata(a).keep then emit('pose',id(fo),{animation='idle',loop=true})end
 if emo~=nil and not animdata(emo).keep then emotion(fo,'idle')end
end
local function path(points)
 if type(points)~='table' then error('unresolved waypoint')end
 if rawget(points,'__vector')==true then return {points}end
 local r={};for _,p in ipairs(points)do if type(p)~='table' or rawget(p,'__vector')~=true then error('unresolved waypoint point')end;r[#r+1]=p end;if #r==0 then error('empty waypoint')end;return r
end
local function move(fo,points,speed,duration,data,handler,key,blocking)
 local h,pts=id(fo),path(points);data=data or {};local p=fo.Position;local from=p;local distance=0
 for _,v in ipairs(pts)do distance=distance+(v-p).magnitude;p=v end
 duration=tonumber(duration) or distance/(tonumber(speed) or (data.run and 4.5 or 3));duration=math.max(.001,duration)
 if moves[h] then bridge('interrupt',h,clock,from)end
 emit('move',h,{points=pts,duration=duration,direction=data.locked_dir,lastDirection=data.last_direction,run=data.run,animation=data.animation or (fo._anim~=false and fo._anim or nil),endAnimation=data.end_animation or 'idle'})
 local movement={at=clock+duration,start=clock,from=from,points=pts,handler=handler,key=key};moves[h]=movement
 spawn(function()sleep(duration);if moves[h]~=movement then return end;fo._pos=pts[#pts];moves[h]=nil;if data.end_callback then data.end_callback()end end)
 if blocking then sleep(duration)end
end
local function utilities(name,values)return setmetatable(values or {},{__index=function(_,k)return proxy(name..'.'..tostring(k))end})end
local function stored_field(t,k)local value=rawget(t,k);if value~=nil then return value end;local mt=getmetatable(t);return mt and type(mt.__index)=='table' and rawget(mt.__index,k) or nil end
local function load_native_npcs(owner)
 local seen={};local function visit(data,depth)
 if type(data)~='table' or rawget(data,'__proxy') or rawget(data,'__actor') or seen[data] or depth>5 then return end;seen[data]=true
 local specs=stored_field(data,'specs') or stored_field(data,'data');local loader=stored_field(data,'load_async');if type(specs)=='table' and not rawget(specs,'__proxy') and type(loader)=='function' then loader(data)end
 for _,child in pairs(data)do visit(child,depth+1)end
 end;visit(owner,0)
end
E.vector=vec;E.vector2=function(x,y)return vec(x,y,0)end;E.get_character=function(h)return actor(h)end;E.get_party_leader=function()return actor('leader')end;E.user_party={Leader=actor('leader')};E.get_field_object=function(h)return actor(h,'field')end
E.get_marker_pos=function(h)local p=bridge('marker',h);if not p then error('missing marker '..tostring(h))end;return vec(p[1],p[2],p[3])end
E.newclass=function(name,parent)return setmetatable({__class=name},{__index=type(parent)=='table' and parent or nil,__call=function(cls,...)local obj=setmetatable({super=parent},{__index=cls});if type(cls.init)=='function' then cls.init(obj,...)end;return obj end})end
E.wait_for_sec=sleep;E.start_coroutine=spawn;E.start_coroutine_async=function(fn,...)fn(...)end
E.yield_return=function(_,method,...)notice('yield_return:'..tostring(method));sleep(.1)end
E.is_unity_null=function(v)return v==nil end;E.typeof=function(v)return v end
E.direction_constants={up='back',down='front',left='left',right='right',none='front'}
E.active_state_type={enabled='enabled',disabled='disabled',deactivated='disabled'}
E.unity_class={vector3={one=vec(1,1,1),zero=vec(),up=vec(0,1,0),right=vec(1,0,0),forward=vec(0,0,1),Lerp=function(a,b,t)return a+(b-a)*t end},vector2={zero=vec()},color={black={r=0,g=0,b=0,a=1},white={r=1,g=1,b=1,a=1}},quaternion=utilities('quaternion'),time=setmetatable({deltaTime=1/30},{__index=function(_,k)if k=='time' or k=='unscaledTime' then return clock end end})}
E.scene_util=utilities('scene_util',{default_version=1,
 set_direction=direction,set_anim=function(fo,holder,args)animation(fo,args,false,holder);fo._anim=animdata(args,nil,holder).name end,set_anim_async=function(fo,holder,args)animation(fo,args,true,holder)end,set_emotion=function(fo,holder,args)emotion(fo,args,holder)end,
 play_normal_speech_action=function(...)speech_action(...)end,play_shout_speech_action=function(a,b,c,d,e,f)speech_action(a,b,c,d,e,f,'shout')end,play_thought_speech_action=function(a,b,c,d,e,f)speech_action(a,b,c,d,e,f,'thought')end,
 show_normal_speech_async=function(a,b)speech(a,b)end,show_shout_speech_async=function(a,b)speech(a,b,'shout')end,show_thought_speech_async=function(a,b)speech(a,b,'thought')end,
 look_around=function(fo,dirs,_,dt)for _,d in ipairs(dirs or {'left','right'})do direction(fo,d);sleep(dt or 1)end end,
 set_anim_loop=function(fo,name)animation(fo,{name=name,loop=true},false)end,
})
E.character_util=utilities('character_util',{
 set_direction=direction,set_position=function(fo,p)fo.Position=p end,get_direction=function(d)return d end,
 set_anim=function(fo,args)animation(fo,args,false,false);fo._anim=animdata(args,nil,false).name end,set_emotion=function(fo,args)emotion(fo,args,false)end,
 remove_anim=function(fo)fo._anim=false;emit('pose',id(fo),{animation='idle',loop=true})end,remove_emotion=function(fo)emotion(fo,'idle')end,
 remove_anim_and_emotion=function(fo)fo._anim=false;emit('pose',id(fo),{animation='idle',expression='idle',loop=true})end,
 normal_jump=function(fo,_)emit('jump',id(fo),{height=.4,duration=.5})end,jump=function(fo,h,d)emit('jump',id(fo),{height=h,duration=d})end,
 spine_set_alpha_fade=function(fo,a,d)emit('fade',id(fo),{value=a,duration=d})end,spine_set_alpha_fade_v2=function(fo,a,d)emit('fade',id(fo),{value=a,duration=d})end,
 set_sorting_layer=function(fo,l,o)emit('pose',id(fo),{sortingLayer=l,sortingOrder=o or 0})end,
 set_shadow_alpha=function(fo,a)emit('shadow',id(fo),{value=a})end,force_update_spines=function()end,
 set_animation_n_times_async=function(fo,args)animation(fo,args,true)end,set_animation_n_times=function(fo,args)animation(fo,args,false)end,
})
E.wp_util=utilities('wp_util',{
 move=function(a,b,c,d,e)move(a,b,c,d,e)end,move_async=function(a,b,c,d,e)move(a,b,c,d,e,nil,nil,true)end,
 move_with_end_callback=function(a,b,c,d,e,f,g)move(a,b,c,d,g,e,f)end,
 wait_move_end=function(handler,key)local ending=clock;for _,m in pairs(moves)do if m.handler==handler and m.key==key then ending=math.max(ending,m.at)end end;sleep(math.max(0,ending-clock))end,
})
E.field_util=utilities('field_util',{get_marker_pos=E.get_marker_pos,get_character=E.get_character,get_field_object=E.get_field_object})
E.camera_util=utilities('camera_util',{set_position=function(p)emit('camera',nil,{position=p,span=9})end,move_async=function(p,d)emit('camera',nil,{position=p,duration=d});sleep(d)end,move=function(p,d)emit('camera',nil,{position=p,duration=d})end,shake=function(_,d)notice('camera.shake')end})
E.screen_util=utilities('screen_util',{fade_in_async=function(d)emit('screen',nil,{value=0,duration=d});sleep(d)end,fade_out_async=function(d)emit('screen',nil,{value=1,duration=d});sleep(d)end,fade_in=function(d)emit('screen',nil,{value=0,duration=d})end,fade_out=function(d)emit('screen',nil,{value=1,duration=d})end})
E.music_player_util=utilities('music_player_util',setmetatable({},{__index=function(_,k)return function()notice('audio:'..k)end end}))
E.choose_util=utilities('choose_util',{})
E.field_object_util=utilities('field_object_util',{set_active_state=function(fo,value)if fo.__kind=='character' then emit('visible',id(fo),{value=value=='enabled'})else notice('field.active:'..id(fo))end end})
E.coroutine_util=utilities('coroutine_util',{while_each_frame=function(d,fn)local n=math.max(1,math.ceil(d*30));for i=1,n do fn(i/n);sleep(d/n)end end,while_from_to_each_frame=function(d,a,b,fn)local n=math.max(1,math.ceil(d*30));for i=1,n do fn(i/n,a+(b-a)*(i/n));sleep(d/n)end end,wait_for_sec=sleep})
E.load_util=utilities('load_util',{create_dynamic_npcs_async=function(specs)local t={};for h,spec in pairs(specs)do dynamic[h]=spec;t[h]=actor(h)end;return t end,dispose_dynamic_npcs=function()end})
E.lua_helper={get_value=function(t,k,d)if type(t)~='table' then return d end;local v=t[k];if v==nil then return d end;return v end,get_or_default=function(v,d)if v==nil then return d end;return v end}
E.type_util=utilities('type_util',{is_table=function(t)return type(t)=='table'end,is_string=function(t)return type(t)=='string'end,is_array=function(t)return type(t)=='table' and not t.__vector end})
E.table_util=utilities('table_util',{get_size=function(t)local n=0;for _ in pairs(t or {})do n=n+1 end;return n end,foreach=function(t,fn)for k,v in pairs(t)do fn(v,k)end end})
E.metatable_helper=utilities('metatable_helper',{create_fx_accessor=function(t)return utilities('fx',t)end,inherit=function(t,base)return setmetatable(t,{__index=base})end,create_npc_accessor=function(t)return setmetatable({},{__index=function(_,k)return actor(t[k] or k)end})end})
local characters=setmetatable({},{__index=function(_,h)return actor(h)end})
local controller=utilities('controller',{character=characters,scene_version=1,cs_controller=proxy('cs_controller'),dynamic_npcs=utilities('dynamic_npcs',{get=function(_,h)return actor(h)end}),cs_section=proxy('cs_section')})
local function initialize_controller(cls)
 local native=setmetatable({super={init=function()end},cs_controller=proxy('cs_controller'),scene_version=1},{__index=cls})
 controller=native
 if type(cls.init)=='function' then cls.init(native,native.cs_controller)end
 -- Load original dynamic NPC specifications; no quest conditions or saves run.
 load_native_npcs(native)
 controller=native
end
local placer={}
function placer:get_group(name)
 local group=bridge('group',name);local g={}
 function g:get_dynamic_member(h)local info=group and group.dynamic_npc_data;local spec=info and info.specs and info.specs[h];if spec then dynamic[h]=spec end;return actor(h)end
 return g
end
function placer:activate_group(name)
 local group=bridge('group',name);if not group then notice('placer:'..name);return end
 local function place(info)local fo=actor(info.name);local pos=info.position;if pos then local pivot=pos.pivot or vec();local offset=pos.offset or vec();fo.Position=vec(pivot.x,pivot.y,pivot.z)+vec(offset.x,offset.y,offset.z)end;if info.direction then direction(fo,info.direction)end;emit('visible',id(fo),{value=true});emit('fade',id(fo),{value=info.alpha_value or 1,duration=info.alpha_duration or 0})end
 for _,info in ipairs(group.member_infos or {})do place(info)end
 if group.dynamic_npc_data then for h,spec in pairs(group.dynamic_npc_data.specs or {})do dynamic[h]=spec end;for _,info in ipairs(group.dynamic_npc_data.dynamic_member_infos or {})do place(info)end end
end
E.get_or_create_global_variable=function(path)return proxy('global:'..path)end
E.load_util.create_dynamic_npcs_with_prefix_async=function(prefix,specs)local t={};for h,spec in pairs(specs)do local handle=prefix..h;dynamic[handle]=spec;t[h]=actor(handle)end;return t end
local operator={load_async=function()end,speech_async=function(_,speaker,key)local text=bridge('text',key);local dt=math.max(1.5,utf8.len(text)*.075+1);emit('dialogue',nil,{text=text,stringKey=key,duration=dt,viewportPosition={.5,.7}});notice('operator portrait:'..speaker);sleep(dt)end}
E.global_table_util=utilities('global_table_util',{try_create=function(name)if name:find('CharacterPlaceController',1,true)then return true,placer end;notice('global_table_util.try_create:'..name);return false,proxy(name)end,try_create_operator_ui=function()return true,operator end})
E.user_util=utilities('user_util',{has_knight_male=function()return true end})
E.stage=utilities('stage',{Name=bridge('stage')})
E.vector_util=utilities('vector_util',{get_x0z=function(p)return vec(p.x,0,p.z)end})
E.vector_util.get_xy0=function(p,z)return vec(p.x,p.y,z or 0)end
E.vector_util.get_0yz=function(p,x)return vec(x or 0,p.y,p.z)end
E.vector_util.lerp=function(a,b,t)return a+(b-a)*t end
E.vector_util.to_direction=function(v)if math.abs(v.x)>=math.abs(v.z)then return v.x>=0 and 'right' or 'left' end;return v.z>=0 and 'up' or 'down' end
E.unity_class.vector3.back=vec(0,0,-1);E.unity_class.vector3.left=vec(-1,0,0);E.unity_class.vector3.down=vec(0,-1,0)
setmetatable(E.unity_class.vector3,{__call=function(_,x,y,z)return vec(x,y,z)end})
E.wait_all_lua=function(...)local left=0;for _,fn in ipairs({...})do if type(fn)=='function' then left=left+1;spawn(function()fn();left=left-1 end)end end;while left>0 do sleep(1/30)end end
E.lua_helper.get_conditional_value=function(condition,a,b)if condition then return a end;return b end
E.wp_util.get_turn_once_wp=function(fo,p,side)if side then return {vec(p.x,p.y,fo.Position.z),p}end;return {vec(fo.Position.x,p.y,p.z),p}end
E.wp_util.get_turn_twice_wp=function(fo,p,middle)if middle.x then return {vec(middle.x,fo.Position.y,fo.Position.z),vec(middle.x,p.y,p.z),p}end;return {vec(fo.Position.x,fo.Position.y,middle.z),vec(p.x,p.y,middle.z),p}end
E.scene_util.play_wait_action=function(fo,holder,dir,a,emo,dt)if dir then direction(fo,dir)end;if a then animation(fo,a,false)end;if emo then emotion(fo,emo)end;sleep(dt);E.character_util.remove_anim_and_emotion(fo)end
E.scene_util.play_custom_action=function(fo,holder,dir,a,emo,action)if dir then direction(fo,dir)end;if a then animation(fo,a,false)end;if emo then emotion(fo,emo)end;action();E.character_util.remove_anim_and_emotion(fo)end
local function choose(options,reaction,condition)
 if condition then notice('choice continuation condition not simulated')end
 local resolved={};for i,o in ipairs(options)do local enabled=true;if type(o[4])=='boolean' then enabled=o[4]elseif type(o[4])=='function' then notice('choice predicate not simulated')end;resolved[i]={o[1],o[2],o[3],enabled}end
 for _,o in ipairs(resolved)do if type(o[2])=='table' and type(o[2].active_condition)=='function' then notice('choice active condition not simulated')end end
 local selected=bridge('choice',choices,resolved);choices[#choices+1]=selected;if not options[selected] or resolved[selected][4]==false then error('unavailable choice')end
 emit('choice',nil,{duration=1});sleep(1);if type(options[selected][3])=='function' then options[selected][3]()end
 if reaction=='release' then emotion(actor('leader'),'attack');animation(actor('leader'),'release',false);sleep(1);E.character_util.remove_anim_and_emotion(actor('leader')) elseif type(reaction)=='function' then reaction()elseif reaction then notice('choice reaction:'..tostring(reaction))end
 return selected
end
E.choose_util.play_choose_event=choose;E.choose_util.play_async=choose
local camera_pos=vec();local camera_size=4.5
E.stage_camera=setmetatable({}, {__index=function(_,key)if key=='LookAtPosition' then return camera_pos elseif key=='Size' then notice('estimated native camera size');return camera_size elseif key=='HalfWidth' then notice('estimated native camera width');return camera_size*16/9 end;return proxy('stage_camera.'..key)end})
E.camera_util.set_position=function(p)camera_pos=p;emit('camera',nil,{position=p,span=camera_size*2})end
E.camera_util.move=function(p,d)emit('camera',nil,{position=p,duration=d});camera_pos=p end
E.camera_util.move_async=function(p,d)E.camera_util.move(p,d);sleep(d)end
E.camera_util.follow_target=function(fo,d)E.camera_util.move(fo.Position,d)end
E.user_party.Count=1;E.user_party[0]=actor('leader')
E.party_util=utilities('party_util',{set_direction=function(d)direction(actor('leader'),d)end,remove_anim_and_emotion=function()E.character_util.remove_anim_and_emotion(actor('leader'))end,remove_emotion=function()emotion(actor('leader'),'idle')end})
E.character_util.set_locked_dir=function(fo,d)direction(fo,d)end
E.character_util.reset_locked_dir=function()end
E.unity_class.mathf={Clamp01=function(x)return math.max(0,math.min(1,x))end,Lerp=function(a,b,t)return a+(b-a)*t end,Min=math.min,Max=math.max,Abs=math.abs,Sin=math.sin,Cos=math.cos,PI=math.pi,Deg2Rad=math.pi/180}
E.screen_util.get_up_down_outside_pos=function(dir,p,offset)local sign=dir=='up' and 1 or -1;notice('estimated native camera size');return vec(p.x,p.y,camera_pos.z+sign*camera_size+(offset or sign))end
E.screen_util.get_left_right_outside_pos=function(dir,p,offset)local sign=dir=='right' and 1 or -1;notice('estimated native camera width');return vec(camera_pos.x+sign*camera_size*16/9+(offset or sign),p.y,p.z)end
E.camera_util.set_target=function(fo)E.camera_util.set_position(fo.Position)end
E.camera_util.return_to_leader=function(d)E.camera_util.move_async(actor('leader').Position,d or 1)end
E.camera_util.resize_to_default=function()end
E.get_stage_event_controller=function(name)return bridge('stage-controller',name)end
E.screen_util.fade_in_circular_async=function(d)notice('circular screen transition');emit('screen',nil,{value=0,duration=d});sleep(d)end
E.character_util.normal_jump_async=function(fo)emit('jump',id(fo),{height=.4,duration=.5});sleep(.5)end
E.character_util.spine_scale=function(fo,value)emit('pose',id(fo),{scale=value})end
E.scene_util.set_group_direction=function(group,dir)for _,fo in pairs(group)do direction(fo,dir)end end
E.scene_util.set_group_emotion=function(group,holder,emo)for _,fo in pairs(group)do emotion(fo,emo)end end
E.sp_util=utilities('sp_util',{start_scene=spawn})
setmetatable(E,{__index=function(_,k)local p=proxy(tostring(k));rawset(E,k,p);return p end})
-- Color32 preserves explicitly supplied custom choice tints.
local function color32(r,g,b,a)return {r=r,g=g,b=b,a=a,__color32=true}end
E.CS=utilities('CS',{UnityEngine=utilities('CS.UnityEngine',{Color32=color32,Animator='CS.UnityEngine.Animator'})})
-- Preserve otherwise lost portrait dialogue text. Portrait artwork remains audited.
E.scene_util.show_portrait_speech_async=function(fo,key,_,data)data=data or {};data.key=key;notice('portrait artwork not rendered:'..id(fo));speech(fo,data)end
E.speech_bubble_util=utilities('speech_bubble_util',{show_speech_bubble_async=function(fo,data)local kind=type(data)=='table' and data.bubble_type or nil;if type(data)=='table' and data.portraitname then notice('portrait artwork not rendered:'..id(fo))end;speech(fo,data,kind)end,show_speech_bubble=function(fo,data)spawn(function()speech(fo,data)end)end})
E.spine_util=utilities('spine_util',{get_animation_duration=function(fo,name)return bridge('duration',id(fo),name,fo.Direction)end})
E.party_util.foreach_member=function(fn)notice('preview party contains leader only');fn(actor('leader'),0)end
E.party_util.set_emotion=function(args)emotion(actor('leader'),args,false)end
local function run(class,method,setup)
 local self=setmetatable({controller=controller,cs_section=proxy('cs_section'),cs_controller=proxy('cs_controller'),place_controller=placer,scene_version=1},{__index=class})
 if class.init then class.init(self,controller,proxy('cs_section'))end
 self.place_controller=placer
 self.operator_ui=operator
 spawn(function()
  if type(class.on_pre_load)=='function' then local ok,err=pcall(class.on_pre_load,self);if not ok then notice('preload interrupted:'..tostring(err))end end
  load_native_npcs(self)
  if setup then setup(self)end
  if method~='start' and type(self.npc_presets)=='table' and type(class.set_npc_with_data)=='function' and self.states and self.npc_presets[self.states.npc_setting] then class.set_npc_with_data(self,self.npc_presets[self.states.npc_setting])end
  if method=='start_scene' and bridge('stage')=='fireworld_1' then placer:activate_group('s1_start_scene');E.camera_util.set_position(self.pivot_pos.sky_scene()+vec(-.5,0,0))end
  local entry=bridge('scene-entry',method);if entry then for h,p in pairs(entry)do local fo=actor(h);fo.Position=vec(p[1],p[2],p[3])end;E.camera_util.set_position(actor('leader').Position)end
  class[method](self)
 end)
 local count=0
 while #tasks>0 do
  count=count+1;if count>15000 then error('scheduler limit')end
  table.sort(tasks,function(a,b)return a.at==b.at and a.id<b.id or a.at<b.at end)
  local task=table.remove(tasks,1);clock=task.at;if clock>1800 then error('scene time limit')end
  local ok,delay=coroutine.resume(task.co);if not ok then return {duration=clock,notices=notices,choices=choices,error=debug.traceback(task.co,tostring(delay))}end
  if coroutine.status(task.co)~='dead' then if delay==nil then delay=1/30 end;if type(delay)~='number' then error('unsupported coroutine yield')end;task.at=clock+delay;serial=serial+1;task.id=serial;tasks[#tasks+1]=task end
 end
 return {duration=clock,notices=notices,choices=choices}
end
return {run=run,env=E,actor=actor,placer=placer,initialize_controller=initialize_controller,stage_controller=function(cls)local instance=setmetatable({cs_controller=proxy('stage_controller.cs_controller')},{__index=cls});if type(cls.init)=='function' then cls.init(instance,instance.cs_controller)end;return instance end}
