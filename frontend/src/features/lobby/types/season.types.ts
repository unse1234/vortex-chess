export type Season = {
  id: string;
  number: number;
  name: string;
  endsAt: string;
};

export type CurrentSeasonResponse = {
  season: Season | null;
};
