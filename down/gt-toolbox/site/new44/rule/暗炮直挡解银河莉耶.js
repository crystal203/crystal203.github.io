// 这是一个示例
export default {
  // 解法名称
  name: "暗炮直挡解银河莉耶",
  // 解法注释
  desc: "适用于棒球非前置",
  // 满分
  maxScore: 250,

  // 对队伍的要求
  preconditions: {
    // 队伍匹配（双方都需4人，且首人严格匹配，其余三人集合相等）
    team: {
      blue: ["Arabelle", "Eva", "Daisy", "Eunha"],
      red: ["Eunha", "Eva", "Daisy", "Rie"]
    },
    // 敌方位置约束（坐标系：左上角 (0,0)）
    redPosition: [
      // 格式：[char, axis, relation, value]
    ]
  },

  // 我方位置约束
  bluePosition: [
    ["Daisy", "x-pos", "ge", 2],
    ["Arabelle", "x-pos", "le", 1],
  ],

  // 评分项
  scoring: [
    // 类型1：单角色坐标评分
    // ["B-Eunha", "x-pos", "equ", 3, 10],

    // 类型2：双角色位置差评分（取绝对值）
    // ["B-Eunha", "R-Eunha", "x-pos", "delta", "ge", 6, 15],

    // 类型3：锁定关系评分
    // ["B-Eunha", "lock", "R-Estel", 20]

    ["B-Arabelle", "R-Rie", "y-pos", "delta", "equ", 0, 50],
    ["B-Daisy", "R-Rie", "y-pos", "delta", "equ", 0, 50],
    ["R-Rie", "lock", "B-Arabelle", 50],
    ["B-Daisy", "lock", "R-Rie", 50],
    ["R-Daisy", "lock", "B-Daisy", 50],
  ]
};