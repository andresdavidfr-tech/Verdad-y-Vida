export interface BibleBook {
  name: string;
  chapters: number;
  testament: 'OT' | 'NT';
}

export interface ReadingDay {
  day: number;
  ot: string; // e.g. "Génesis 1-2"
  nt: string; // e.g. "Mateo 1"
}

export interface UserProgress {
  uid: string;
  completedDays: number[];
  favorites: Record<string, string>; // date string -> verse text
  moods: Record<string, string>; // date string -> mood
}

export type Mood = 'Agradecido' | 'Necesitado' | 'Gozoso' | 'Triste' | 'Cansado' | 'Buscando';
