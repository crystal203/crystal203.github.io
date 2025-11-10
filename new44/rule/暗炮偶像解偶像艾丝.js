// 这是一个示例
export default {
  // 解法名称
  name: "暗炮偶像解偶像艾丝",
  // 解法注释
  desc: "适用于偶像后置的可切后阵容",
  // 满分
  maxScore: 250,

  // 对队伍的要求
  preconditions: {
    // 队伍匹配（双方都需4人，且首人严格匹配，其余三人集合相等）
    team: {
      blue: ["Arabelle", "Eva", "Eunha", "Daisy"],
      red: ["Eva", "Eunha", "Estel", "Daisy"]
    },
    // 敌方位置约束（坐标系：左上角 (0,0)）
    redPosition: [
      // 格式：[char, axis, relation, value]
      ["Eva", "x-pos", "neq", 10],
    ]
  },

  // 我方位置约束
  bluePosition: [
    ["Arabelle", "x-pos", "le", 1],
    ["Eunha", "x-pos", "le", 1],
    ["Daisy", "x-pos", "ge", 2],
    ["Eva", "x-pos", "le", 1],
  ],

  // 评分项
  scoring: [
    ["R-Estel", "lock", "B-Arabelle", 0], //0

    ["B-Arabelle", "lock", "R-Estel", 10], //1
    ["and", 0, 1, 10], //2
    ["B-Daisy", "B-Daisy-lock", "x-pos", "delta"], //3 我方嘲讽距离
    ["R-Daisy", "R-Daisy-lock", "x-pos", "delta"], //4 对方嘲讽距离
    //相等
    ["compare", "#3", "equ", "#4"], //5
    //则我方必须锁银河，对方必须锁暗炮或者偶像，且要互锁
    ["B-Daisy", "lock", "R-Eunha", 0], //6
    ["R-Daisy", "lock", "B-Eva", 15], //7
    ["R-Daisy", "lock", "B-Arabelle", 0], //8
    ["B-Daisy-lock", "lock", "B-Daisy", 0], //9
    ["R-Daisy-lock", "lock", "R-Daisy", 0], //10
    ["and", 7, 8, 0], //11
    ["and", 6, 11, 0], //12
    ["and", 5, 12, 0], //13
    ["and", 9, 10, 0], //14
    ["and", 13, 14, 100], //15

    //我方更小
    ["compare", "#3", "l", "#4"], //16
    ["and", 16, 16, 120], //17

    ['B-Daisy', "lock", "R-Eunha", 0], //18
    ['B-Daisy', "lock", "R-Eva", 0], //19
    ["or", 18, 19, 20], //20

    ["R-Daisy", "lock", "B-Daisy", 0], //21
    ["not", 21, 20],

    ["B-Eunha", "B-Eunha-lock", "y-pos", "delta", "le", 1, 10],
    ["B-Daisy", "B-Daisy-lock", "y-pos", "delta", "equ", 0, 10],
    ["B-Daisy", "B-Daisy-lock", "y-pos", "delta", "equ", 1, 5],

    ["R-Daisy", "R-Daisy-lock", "y-pos", "delta", "equ", 1, 10],
    ["R-Daisy", "R-Daisy-lock", "y-pos", "delta", "equ", 0, 5],
    
    ["B-Daisy", "B-Arabelle", "y-pos", "delta", "ge", 3, 15],
    ["B-Daisy", "x-pos", "equ", 3, 5],
  ]
};