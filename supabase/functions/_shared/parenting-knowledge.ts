export type ParentingKnowledgeDocument = {
  slug: string;
  category: 'feeding' | 'sleep' | 'development' | 'vaccination' | 'health' | 'safety';
  title: string;
  content: string;
  source: string;
};

export const PARENTING_KNOWLEDGE_DOCUMENTS: ParentingKnowledgeDocument[] = [
  {
    slug: 'feeding-solid-food-start',
    category: 'feeding',
    title: '이유식 시작 시기와 원칙',
    source: 'local-parenting-guide',
    content:
      '이유식은 대개 생후 6개월 전후, 목을 가누고 보호자가 먹는 모습을 관심 있게 보며 숟가락을 입에 넣었을 때 혀로 계속 밀어내지 않을 때 시작합니다. 처음에는 쌀미음처럼 단순한 음식부터 소량으로 시작하고, 철분 보충을 위해 고기, 생선, 달걀, 콩류 등 철분이 있는 식품을 단계적으로 포함합니다. 새로운 음식은 한 번에 하나씩 추가해 반응을 살핍니다.',
  },
  {
    slug: 'feeding-milk-intake-warning',
    category: 'feeding',
    title: '수유량과 진료가 필요한 신호',
    source: 'local-parenting-guide',
    content:
      '수유량은 아이의 월령, 체중, 성장 속도에 따라 차이가 큽니다. 하루 소변 기저귀가 뚜렷하게 줄거나, 처짐, 반복 구토, 빠른 호흡, 체중 증가 부진이 있으면 단순 수유 문제로 보지 말고 소아청소년과에 상담합니다. 신생아나 어린 영아는 탈수가 빨리 진행될 수 있어 수유 거부가 지속되면 빠른 확인이 필요합니다.',
  },
  {
    slug: 'sleep-infant-safe-sleep',
    category: 'sleep',
    title: '영아 안전 수면',
    source: 'local-parenting-guide',
    content:
      '영아는 등을 대고 눕혀 재우고, 단단하고 평평한 매트리스 위에서 자게 합니다. 베개, 두꺼운 이불, 범퍼, 인형처럼 얼굴을 덮을 수 있는 물건은 수면 공간에서 치웁니다. 보호자와 같은 방에서 자되 같은 침대에서 자는 것은 피하는 편이 안전합니다. 과열을 피하고 금연 환경을 유지합니다.',
  },
  {
    slug: 'sleep-night-waking',
    category: 'sleep',
    title: '밤중 각성과 수면 루틴',
    source: 'local-parenting-guide',
    content:
      '밤에 자주 깨는 것은 영아와 유아에게 흔합니다. 낮잠, 수유, 분리불안, 이앓이, 질병, 수면 환경 변화가 영향을 줄 수 있습니다. 일정한 취침 시간, 조용한 조명, 반복되는 짧은 루틴을 유지하면 도움이 됩니다. 갑작스러운 고열, 호흡곤란, 축 처짐, 심한 통증이 동반되면 수면 훈련보다 건강 상태 확인이 우선입니다.',
  },
  {
    slug: 'development-motor-milestones',
    category: 'development',
    title: '운동 발달은 범위로 본다',
    source: 'local-parenting-guide',
    content:
      '뒤집기, 앉기, 기기, 걷기 같은 운동 발달은 아이마다 속도 차이가 큽니다. 특정 월령에 반드시 해내야 한다고 보기보다 이전보다 새로운 움직임이 늘고 대칭적으로 몸을 쓰는지 관찰합니다. 한쪽만 계속 쓰거나, 힘이 지나치게 없거나 뻣뻣하거나, 이미 하던 기능을 잃는 경우에는 평가가 필요합니다.',
  },
  {
    slug: 'development-language-social',
    category: 'development',
    title: '언어와 사회성 발달 관찰',
    source: 'local-parenting-guide',
    content:
      '언어 발달은 옹알이, 눈맞춤, 손짓, 이름을 부를 때 반응, 간단한 지시 이해처럼 여러 신호를 함께 봅니다. 말이 늦더라도 의사소통 의도와 상호작용이 살아 있으면 경과 관찰을 할 수 있지만, 눈맞춤이 적고 이름 반응이 거의 없거나 의사소통 시도가 뚜렷하게 부족하면 전문가 상담이 도움이 됩니다.',
  },
  {
    slug: 'vaccination-fever-after-shot',
    category: 'vaccination',
    title: '예방접종 후 발열과 관리',
    source: 'local-parenting-guide',
    content:
      '예방접종 후 미열, 접종 부위 통증, 보챔은 비교적 흔하며 대개 1~2일 안에 호전됩니다. 수분 섭취와 휴식을 돕고 아이 상태를 관찰합니다. 고열이 지속되거나, 경련, 호흡곤란, 얼굴이나 입술 부종, 심한 처짐, 접종 부위가 빠르게 붓고 붉어지는 경우에는 즉시 의료진에게 문의합니다.',
  },
  {
    slug: 'vaccination-schedule',
    category: 'vaccination',
    title: '예방접종 일정 확인',
    source: 'local-parenting-guide',
    content:
      '예방접종은 국가별 권고 일정과 아이의 건강 상태에 따라 달라질 수 있습니다. 접종 누락이나 지연이 있어도 대부분 따라잡기 일정이 가능하므로 임의로 포기하지 말고 소아청소년과나 보건소에서 아이의 접종 기록을 기준으로 다음 일정을 확인합니다.',
  },
  {
    slug: 'health-fever-red-flags',
    category: 'health',
    title: '열이 날 때 위험 신호',
    source: 'local-parenting-guide',
    content:
      '열 자체보다 아이의 전반적인 상태가 중요합니다. 3개월 미만 영아의 38도 이상 발열, 호흡곤란, 청색증, 심한 처짐, 의식 저하, 탈수 의심, 반복 구토, 목 경직, 발진이 퍼지며 상태가 나빠지는 경우는 빠른 진료가 필요합니다. 해열제 용량은 체중 기준이므로 임의로 늘리지 않습니다.',
  },
  {
    slug: 'health-diaper-hydration',
    category: 'health',
    title: '기저귀로 보는 수분 상태',
    source: 'local-parenting-guide',
    content:
      '소변 기저귀 수가 평소보다 뚜렷하게 줄거나, 소변 색이 진하고 양이 적거나, 입술과 입안이 마르고 눈물이 거의 없거나, 축 처지는 모습이 있으면 탈수를 의심합니다. 특히 구토나 설사가 함께 있으면 수분 손실이 커질 수 있어 관찰을 강화하고 필요하면 진료를 봅니다.',
  },
  {
    slug: 'safety-choking-prevention',
    category: 'safety',
    title: '질식 예방',
    source: 'local-parenting-guide',
    content:
      '둥글고 단단한 음식은 아이 기도에 걸릴 위험이 있어 월령에 맞게 잘게 자르거나 형태를 바꿉니다. 포도, 방울토마토, 견과류, 사탕, 큰 고기 조각은 특히 주의합니다. 식사 중에는 앉아서 먹게 하고 뛰거나 누운 상태에서 먹지 않도록 합니다.',
  },
  {
    slug: 'safety-home-proofing',
    category: 'safety',
    title: '집 안 안전 점검',
    source: 'local-parenting-guide',
    content:
      '기기 시작하거나 잡고 서기 시작하면 사고 위험이 크게 늘어납니다. 콘센트, 전선, 모서리, 작은 물건, 약품, 세제, 뜨거운 음료, 가구 전도 위험을 점검합니다. 욕조나 물이 담긴 곳에는 짧은 시간도 혼자 두지 않고, 높은 곳에서 기저귀를 갈 때도 손을 떼지 않습니다.',
  },
];
