export interface Source {
  readonly publisher: string;
  readonly title: string;
  readonly url: string;
}

export const SOURCES = {
  ACOG_ABNORMAL_BLEEDING: {
    publisher: 'American College of Obstetricians and Gynecologists (ACOG)',
    title: 'Abnormal Uterine Bleeding',
    url: 'https://www.acog.org/womens-health/faqs/abnormal-uterine-bleeding',
  },
  NHS_PERIOD_PAIN: {
    publisher: 'NHS',
    title: 'Period pain',
    url: 'https://www.nhs.uk/symptoms/period-pain/',
  },
  SOGC_HEAVY_PERIODS: {
    publisher: 'Society of Obstetricians and Gynaecologists of Canada (SOGC)',
    title: 'Heavy menstrual bleeding',
    url: 'https://www.yourperiod.ca/abnormal-pain-and-menstrual-bleeding/heavy-menstrual-bleeding/',
  },
  NHS_HEAVY_PERIODS: {
    publisher: 'NHS',
    title: 'Heavy periods',
    url: 'https://www.nhs.uk/conditions/heavy-periods/',
  },
  ASRM_FERTILITY: {
    publisher: 'American Society for Reproductive Medicine (ASRM)',
    title: 'Optimizing natural fertility',
    url: 'https://www.asrm.org/practice-guidance/practice-committee-documents/optimizing-natural-fertility-a-committee-opinion-2021/',
  },
  NHS_LIBIDO: {
    publisher: 'NHS',
    title: 'Low sex drive (loss of libido)',
    url: 'https://www.nhs.uk/symptoms/loss-of-libido/',
  },
  CANADA_CONSENT: {
    publisher: 'Department of Justice Canada',
    title: 'Criminal Code, section 273.1: Meaning of consent',
    url: 'https://laws-lois.justice.gc.ca/eng/acts/C-46/section-273.1.html',
  },
} as const satisfies Record<string, Source>;

export interface InfoCard {
  readonly id: string;
  readonly title: string;
  readonly body: readonly string[];
  readonly sources: readonly Source[];
}

export const EMERGENCY_CARD: InfoCard = {
  id: 'heavy-bleeding-emergency',
  title: 'Get emergency care now',
  body: [
    'Very heavy bleeding with chest pain, breathlessness, or dizziness needs emergency care now.',
    'Call 911 or go to the nearest emergency department.',
  ],
  sources: [SOURCES.ACOG_ABNORMAL_BLEEDING],
};

export const INFO_CARDS: readonly InfoCard[] = [
  {
    id: 'period-pain',
    title: 'Period pain',
    body: [
      'Cramps are common. Heat, gentle movement and over-the-counter pain relief often help.',
      'See a doctor if pain stops you from doing everyday things, gets worse over time, or comes with bleeding between periods or after sex.',
    ],
    sources: [SOURCES.NHS_PERIOD_PAIN],
  },
  {
    id: 'heavy-bleeding',
    title: 'Heavy bleeding',
    body: [
      'Soaking a pad or tampon every hour for two hours or more, passing large clots, or bleeding that affects daily life is worth discussing with a doctor.',
    ],
    sources: [SOURCES.SOGC_HEAVY_PERIODS, SOURCES.NHS_HEAVY_PERIODS],
  },
  {
    id: 'not-birth-control',
    title: 'This is not birth control',
    body: [
      'Fertile-window estimates are rough. Lower — not zero. Pregnancy is possible on any day you have sex without contraception.',
    ],
    sources: [SOURCES.ASRM_FERTILITY],
  },
  {
    id: 'desire',
    title: 'Desire changes, and that is normal',
    body: [
      'Desire rises and falls with stress, sleep, health, the relationship and the cycle.',
      'Patterns in this app describe past logs. They never mean someone wants sex now — consent is asked for and given each time, and can be withdrawn at any time.',
    ],
    sources: [SOURCES.NHS_LIBIDO, SOURCES.CANADA_CONSENT],
  },
];
