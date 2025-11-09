// 这是一个示例
export default {
  // 解法名称
  name: "萝冰火龙解火龙三切",
  // 解法注释
  desc: "适用于火龙前置",
  // 满分
  maxScore: 250,
  
  // 对队伍的要求
  preconditions: {
    // 队伍匹配（双方都需4人，且首人严格匹配，其余三人集合相等）
    team: {
      blue: ["Daisy", "Eva", "Beth", "Kahlor"], 
      red:  ["Kahlor", "Rie", "Beth", "Eva"] 
    },
    // 敌方位置约束（坐标系：左上角 (0,0)）
    redPosition: [
      // 格式：[char, axis, relation, value]
      ["Kahlor", "x-pos", "equ", 10],
    ]
  },

  // 我方位置约束
  bluePosition: [
    ["Daisy", "x-pos", "ge", 2],
    ["Eva",  "x-pos", "equ", 0],
    ["Beth", "x-pos", "ge", 1],
    ["Kahlor", "x-pos", "ge", 1],
  ],

  // 评分项
  scoring: [
    // 类型1：单角色坐标评分
    // ["B-Eunha", "x-pos", "equ", 3, 10],
    
    // 类型2：双角色位置差评分（取绝对值）
    // ["B-Eunha", "R-Eunha", "x-pos", "delta", "ge", 6, 15],
    
    // 类型3：锁定关系评分
    // ["B-Eunha", "lock", "R-Estel", 20]
    
    ["B-Eva", "R-Kahlor", "y-pos", "delta", "equ", 0, 50],    //#0
    ["B-Daisy", "R-Kahlor", "y-pos", "delta", "equ", 0, 50],  //#1
    ["B-Eva", "lock", "R-Beth", 0],                           //#2
    ["B-Eva", "lock", "R-Rie", 0],                            //#3
    ["or", 2, 3, 40],                                         //#4
    ["B-Daisy", "lock", "R-Kahlor", 50],                      //#5
    ["B-Eva-lock", "lock", "B-Daisy", 25],                    //#6
    ["R-Eva", "lock", "B-Kahlor", 35]                         //#7
  ]
};