"""Small source-only regressions for audit evidence; no rendering or package edits."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('coverage_audit',ROOT/'tools/fx/audit-source-coverage.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
spec=importlib.util.spec_from_file_location('coverage_direction',ROOT/'tools/fx/audit-direction-contracts.py')
direction=importlib.util.module_from_spec(spec);spec.loader.exec_module(direction)

SOURCE='''
local action_state_class = {}
function action_state_class:init(param)
 self.action_type = {slash=1,stomp=2}
 local key = cs_util.get_string_from_dictionary(param, 'AttackType')
 self.attack_type = self.action_type[key]
end
function action_state_class:update()
 if self.attack_type == self.action_type.slash then
  self:update_slash()
 elseif self.attack_type == self.action_type.stomp then
  self:update_stomp()
 end
 if self.attack_type == self.action_type.stomp then
  character_util.jump(self.owner, 1, 0.5)
 end
end
function action_state_class:update_slash()
 battle_util.instantiate_effect(self, 'slash', self.owner.Position)
end
function action_state_class:update_stomp()
 battle_util.instantiate_effect(self, 'stomp', self.owner.Position)
end
function action_state_class:on_hit()
 battle_util.instantiate_effect(self, 'still-unbound', self.owner.Position)
end
'''

def reach(source=SOURCE,attack='slash'):
 inv=audit.source_inventory(source,direction.arguments,direction.calls)
 return inv,audit.action_reachability(source,dict(AttackType=attack),inv)

class CoverageEvidenceTests(unittest.TestCase):
 def test_exact_enum_dispatch_retains_full_literals_and_unrelated_calls(self):
  inv,live=reach()
  self.assertEqual({c['key'] for c in live['effects']},{'slash','still-unbound'})
  self.assertEqual({c['key'] for c in inv['effects']},{'slash','stomp','still-unbound'})
  self.assertEqual(live['features']['jump'],[])
  self.assertEqual(live['excludedEffects'][0]['evidence']['allowedValues'],['stomp'])

 def test_unguarded_call_or_function_value_prevents_exclusion(self):
  for extra in ['self:update_stomp()','local handler = action_state_class.update_stomp']:
   with self.subTest(extra=extra):
    _,live=reach(SOURCE+'\n'+extra)
    self.assertIn('stomp',{c['key'] for c in live['effects']})

 def test_unknown_mutation_or_dynamic_dispatch_fails_open(self):
  for extra in ['self.attack_type = external_value','self[dynamic_method](self)']:
   with self.subTest(extra=extra):
    inv,live=reach(SOURCE+'\n'+extra)
    self.assertEqual(inv['effects'],live['effects'])
    self.assertEqual(inv['features'],live['features'])

 def test_action_field_requires_source_assignment_and_known_enum(self):
  _,live=reach(SOURCE.replace("'AttackType'","'OtherField'"))
  self.assertEqual(len(live['effects']),3)
  _,live=reach(attack='unknown')
  self.assertEqual(len(live['effects']),3)

 def test_option_metadata_is_not_branch_completion(self):
  self.assertFalse(audit.recipe_inventory(dict(behavior='timeline',mythOptionListField='MythOptionId',optionParameterSource='active-ascent-option'))['features']['option'])

 def test_schema_dependency_drift_and_source_drift_invalidate_binding(self):
  old=audit.REPOSITORY_ROOT
  try:
   with tempfile.TemporaryDirectory() as directory:
    root=Path(directory);(root/'tools/fx').mkdir(parents=True)
    runtime=root/'consumer.js';runtime.write_text('reviewed output',encoding='utf8')
    source='function operation() end';plan=dict(behavior='test-helper',sourceSha256=audit.sha(source.encode()))
    descriptor=dict(selector=dict(behavior='test-helper'),dependencies={'consumer.js':audit.sha(runtime.read_bytes())},
      sourceGuardAll=['function operation()'],features=dict(projectile=True),effectKeys=['emitted'])
    (root/'tools/fx/source-coverage-output-schemas.json').write_text(json.dumps(dict(contracts=[descriptor])),encoding='utf8')
    audit.REPOSITORY_ROOT=root
    good=audit.helper_output_inventory(plan,{},source)
    self.assertTrue(good['valid']);self.assertEqual(good['effectKeys'],['emitted']);self.assertEqual(len(good['schemaSha256']),64)
    changed=audit.helper_output_inventory(plan,{},source+'\n-- changed source')
    self.assertFalse(changed['valid']);self.assertEqual(changed['effectKeys'],[])
    runtime.write_text('changed output',encoding='utf8')
    bad=audit.recipe_inventory(plan,{},source)
    self.assertFalse(bad['helperOutput']['valid']);self.assertFalse(bad['features']['projectile']);self.assertNotIn('emitted',bad['strings'])
  finally:audit.REPOSITORY_ROOT=old

 def test_native_soundwave_is_never_assigned_a_lua_source(self):
  self.assertEqual(audit.plan_source_kind(dict(behavior='native-soundwave',source='borrowed.lua')),'native-CSharp')
  self.assertEqual(audit.plan_source_kind(dict(source='native ARM64 registered type')),'native-CSharp')
  self.assertEqual(audit.plan_source_kind(dict(source='actual.lua')),'Lua')
  self.assertEqual(audit.plan_source_kind(dict(source='actual.cs')),'unclassified-reference')

if __name__=='__main__':unittest.main()
