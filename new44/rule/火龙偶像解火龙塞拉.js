// 火龙塞拉镜像解火龙塞拉
export default {
  // 解法名称
  name: "火龙偶像解火龙塞拉",
  // 解法注释
  desc: "适用于火龙前置的情形。暗刀可以换火腿。本阵容测试中。",
  // 满分（30 + 50 + 60 + 30 + 10）
  maxScore: 180,

  // 对队伍的要求
  preconditions: {
    // 队伍匹配（双方都需4人，且首人严格匹配，其余三人集合相等）
    team: {
      blue: ["Kahlor", "Beth", "Eva", "Noel"],
      red: ["Kahlor", "Beth", "Seira", "Noel"]
    },
    // 敌方位置约束（坐标系：左上角 (0,0)）
    redPosition: [
      // 格式：[char, axis, relation, value]
    ]
  },

  // 我方位置约束（x-pos 即列下标，0 起算；equ 3 = 第 4 列）
  bluePosition: [
    // 格式：[char, axis, relation, value]
    ["Kahlor", "x-pos", "ge", 2],
    ["Beth", "x-pos", "equ", 3],
  ],

  // 评分项
  scoring: [
    // 类型1：单角色坐标评分
    // ["B-Eunha", "x-pos", "equ", 3, 10],

    // 类型2：双角色位置差评分（取绝对值）
    // ["B-Eunha", "R-Eunha", "x-pos", "delta", "ge", 6, 15],

    // 类型3：锁定关系评分
    // ["B-Eunha", "lock", "R-Estel", 20],

    // 敌方贝丝锁我方贝丝
    ["R-Beth", "lock", "B-Beth", 30],                          //#0
    // 我方贝丝锁敌方凯勒
    ["B-Beth", "lock", "R-Kahlor", 50],                        //#1

    // —— 敌方凯勒锁我方诺艾尔，且诺艾尔在我方贝丝正左方 ——
    ["R-Kahlor", "lock", "B-Noel", 0],                         //#2
    ["B-Beth", "B-Noel", "y-pos", "delta", "equ", 0, 0],       //#3 正：行号相等
    ["B-Noel", "x-pos"],                                       //#4
    ["B-Beth", "x-pos"],                                       //#5
    ["sub", "#4", "#5"],                                       //#6 带符号列差（delta 取绝对值，无法定向）
    ["compare", "#6", "le", -1],                               //#7 列坐标 < 贝丝（整数上等价，用 le 避开单字母 l）
    ["and", 3, 7],                                             //#8
    ["and", 2, 8],                                             //#9

    // —— 敌方凯勒锁我方塞拉，且塞拉在我方贝丝正左方 ——
    ["R-Kahlor", "lock", "B-Eva", 0],                        //#10
    ["B-Beth", "B-Eva", "y-pos", "delta", "equ", 0, 0],      //#11 正：行号相等
    ["B-Eva", "x-pos"],                                      //#12
    ["B-Beth", "x-pos"],                                       //#13
    ["sub", "#12", "#13"],                                     //#14
    ["compare", "#14", "le", -1],                              //#15 列坐标 < 贝丝（整数上等价，用 le 避开单字母 l）
    ["and", 11, 15],                                           //#16
    ["and", 10, 16],                                           //#17

    // 两路互斥（凯勒只能锁一个），命中任一即得 60
    ["or", 9, 17, 60],                                         //#18

    // 敌方凯勒与我方贝丝同行
    ["R-Kahlor", "B-Beth", "y-pos", "delta", "equ", 0, 30],    //#19
    // 我方诺艾尔与我方塞拉行差至少 2
    ["B-Noel", "B-Eva", "y-pos", "delta", "ge", 2, 10]       //#20
  ]
};
