// Class lists. The site and its GitHub repo are public, so only a student's
// first name + father's name is shown (no family names, no ID numbers).

export const CLASSES: Record<string, string[]> = {
  '4A': [
    'Abdulaziz Mohammed',
    'Abdullah Mohammad',
    'Ahmad Zakaria',
    'Alfars Ahmad',
    'Ali Mansoor',
    'Amro Tarig',
    'Awss Yamen',
    'Iyas Motasem',
    'Karim Majdi',
    'Osama Ahmed',
    'Rawad Aseel',
    'Sami Wael',
    'Taha',
    'Taim Iead',
    'Tamim Sultan',
    'Wared Yamen',
    'Yousef Ayham',
    'Ziyad Ahmad',
    'طلال رامي',
    'عبدالله بسام',
    'ايفان هاني',
    'عز الدين عماد',
    'علي عبدالله',
    'سمهر مضر',
  ],
  '4B': [
    'Abdulaziz Fawzan',
    'Adam Issa',
    'Ahmed Faisal',
    'Ahmed Ghassan',
    'Alaa Machal',
    'Ali Waheed',
    'Danial Adel',
    'Emad Jamil',
    'Faris Rackan',
    'Ibrahim',
    'Kareem Mohammad',
    'Khaled Mohamad',
    'Laith Majed',
    'Murad',
    'Omar Abdelbary',
    'Rakan Ayman',
    'Rian Mohammad',
    'Wesam Anas',
    'Yazan',
    'Yousef Isam',
    'عبدالحميد راشد',
  ],
}

export const CLASS_IDS = Object.keys(CLASSES)

export const isArabic = (s: string) => /[؀-ۿ]/.test(s)
