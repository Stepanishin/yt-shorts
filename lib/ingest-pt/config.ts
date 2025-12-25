export interface PiadaComIngestConfig {
  enabled: boolean;
  sources: Array<{
    category: string;
    page?: number;
    baseUrl?: string;
    timeoutMs?: number;
  }>;
}

export interface IngestConfigPT {
  piadacom: PiadaComIngestConfig;
}

export const getDefaultIngestConfigPT = (): IngestConfigPT => ({
  piadacom: {
    enabled: true,
    sources: [
      { category: "01" }, // Animais (Животные)
      { category: "02" }, // Esportes (Спорт)
      { category: "03" }, // Informática (IT)
      { category: "04" }, // Humor negro (Черный юмор)
      { category: "05" }, // Celebridades (Знаменитости)
      { category: "06" }, // Política (Политика)
      { category: "07" }, // Sexo (Секс)
      { category: "08" }, // Diversos (Разное) - самая большая категория
      { category: "09" }, // Guerra dos sexos (Война полов)
      { category: "10" }, // Infames (Дурацкие)
      { category: "11" }, // Religiosas (Религиозные)
      { category: "12" }, // Made in Portugal (Португальские)
      { category: "13" }, // Nacionalidades (Национальности)
      { category: "14" }, // Nojentas (Отвратительные)
      { category: "15" }, // Frases (Фразы)
    ],
  },
});
