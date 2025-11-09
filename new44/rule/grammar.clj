[team] ::= 'R' | 'B'
[name] ::= 'Kahlor' | 'Daisy' | ...
[character] ::= [team]-[name]('-lock')
[axis] ::= 'x-pos' | 'y-pos'
[relation] ::= 'equ' | 'le' | 'ge' | 'neq'
[reference] ::= '[#' No ']'
[score] ::= [number]
[element] ::= [number] | [reference]

[LogicCmd] ::= 
'and' [reference] ',' [reference] ([score]) -> bool                     |
'or' [reference] ',' [reference] ([score]) -> bool                      |
'not' [referece] ([score]) -> bool                                      |
'xor' [reference] ([score]) -> bool

[ArithCmd] ::=
'subabs' [element] [element] -> number                                  |
'const' [number] -> number

[PosCmd] ::=
[character] [axis] [relation] [element] [score] -> bool                 |
[character] [character] [axis] 'delta' [element] [score] -> bool        |
[character] [axis] -> number                                            |
[character] [character] [axis] 'delta' -> number

[LockCmd] ::=
[character] 'lock' [character] [score] -> bool

[command] ::= [LogicCmd] | [ArithCmd] | [PosCmd] | [LockCmd]

