// 这是一个示例
export default {
  // 解法名称
  name: "偶像艾弓解偶像暗刀",
  // 解法注释
  desc: "（固定站位解）适用于偶像后置",
  // 满分
  maxScore: 25,

  // 对队伍的要求
  preconditions: {
    // 队伍匹配（双方都需4人，且首人严格匹配，其余三人集合相等）
    team: {
      blue: ["Eva", "Daisy", "Estel", "Gabriel"],
      red: ["Eva", "Beth", "Daisy", "Eunha"]
    },
    // 敌方位置约束（坐标系：左上角 (0,0)）
    redPosition: [
      // 格式：[char, axis, relation, value]
      ["Eva", "x-pos", "ge", 12],
    ]
  },

  // 我方位置约束
  bluePosition: [
    ["Daisy", "x-pos", "equ", 2],
    ["Estel", "x-pos", "equ", 3],
    ["Eva", "x-pos", "equ", 0],
    ["Gabriel", "x-pos", "equ", 0],
  ],

  // 评分项
  scoring: [
    // 类型1：单角色坐标评分
    // ["B-Eunha", "x-pos", "equ", 3, 10],

    // 类型2：双角色位置差评分（取绝对值）
    // ["B-Eunha", "R-Eunha", "x-pos", "delta", "ge", 6, 15],

    // 类型3：锁定关系评分
    // ["B-Eunha", "lock", "R-Estel", 20]
    ["B-Eva", "R-Eva", "y-pos", "delta", "le", 3, 5],
    ["B-Eva", "y-pos", "equ", 0, 0],
    ["B-Eva", "y-pos", "equ", 4, 0],
    ["or", 1, 2, 5],
    ["B-Eva", "B-Estel", "y-pos", "delta", "equ", 4, 5],
    ["B-Eva", "B-Daisy", "y-pos", "delta", "equ", 3, 5],
    ["B-Eva", "B-Gabriel", "y-pos", "delta", "equ", 1, 5],
  ]
};