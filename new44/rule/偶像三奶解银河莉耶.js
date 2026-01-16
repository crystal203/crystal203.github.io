// 这是一个示例
export default {
  // 解法名称
  name: "偶像三奶解银河莉耶",
  // 解法注释
  desc: "适用于可切后的情形",
  // 满分
  maxScore: 150,

  // 对队伍的要求
  preconditions: {
    // 队伍匹配（双方都需4人，且首人严格匹配，其余三人集合相等）
    team: {
      blue: ["Eva", "Gabriel", "Miya", "Daisy"],
      red: ["Eunha", "Eva", "Rie", "Daisy"],
    },
    // 敌方位置约束（坐标系：左上角 (0,0)）
    redPosition: [
      // 格式：[char, axis, relation, value]
    ]
  },

  // 我方位置约束
  bluePosition: [
    ["Eva", "x-pos", "le", 1],
    ["Gabriel", "x-pos", "le", 2],
    ["Daisy", "x-pos", "ge", 2],
    ["Miya", "x-pos", "le", 2],
  ],

  // 评分项
  scoring: [
    ["B-Daisy", "lock", "R-Eunha", 50], //0

    ["B-Daisy", "B-Daisy-lock", "x-pos", "delta"], //1 我方嘲讽距离
    ["R-Daisy", "R-Daisy-lock", "x-pos", "delta"], //2 对方嘲讽距离
    //相等
    ["compare", "#1", "equ", "#2"], //3
    //则对方必须锁火奶或者偶像，且要互锁
    ["R-Daisy", "lock", "B-Eva", 0], //4
    ["R-Daisy", "lock", "B-Miya", 0], //5
    ["B-Daisy-lock", "lock", "B-Daisy", 0], //6
    ["R-Daisy-lock", "lock", "R-Daisy", 0], //7
    ["or", 4, 5, 0], //8
    ["and", 6, 7, 0], //9
    ["and", 8, 9, 0], //10
    ["and", 3, 10, 100], //11


    //我方更小
    ["compare", "#1", "l", "#2"], //12
    //只要不锁萝冰
    ["R-Daisy", "lock", "B-Daisy", 0], //13
    ["not", 13, 0], //14
    ["and", 12, 14, 100],
  ]
};