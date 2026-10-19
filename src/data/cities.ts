// The bundled list of cities the student picks from, so prayer times need
// no network. Coordinates are the city centre, which is close enough: a few
// kilometres move a prayer time by seconds.

export type City = {
  id: string;
  name: string;
  nameLatin: string;
  country: string;
  latitude: number;
  longitude: number;
};

// [id, Arabic name, Latin name, country, latitude, longitude]
const ROWS: [string, string, string, string, number, number][] = [
  // Saudi Arabia
  ['makkah', 'مكة المكرمة', 'Makkah Mecca', 'السعودية', 21.4225, 39.8262],
  ['madinah', 'المدينة المنورة', 'Madinah Medina', 'السعودية', 24.4686, 39.6142],
  ['riyadh', 'الرياض', 'Riyadh', 'السعودية', 24.7136, 46.6753],
  ['jeddah', 'جدة', 'Jeddah Jiddah', 'السعودية', 21.4858, 39.1925],
  ['dammam', 'الدمام', 'Dammam', 'السعودية', 26.4207, 50.0888],
  ['taif', 'الطائف', 'Taif', 'السعودية', 21.2703, 40.4158],
  ['buraydah', 'بريدة', 'Buraydah', 'السعودية', 26.3592, 43.9818],
  ['abha', 'أبها', 'Abha', 'السعودية', 18.2164, 42.5053],
  ['tabuk', 'تبوك', 'Tabuk', 'السعودية', 28.3838, 36.555],
  ['hail', 'حائل', 'Hail', 'السعودية', 27.5114, 41.7208],
  // Gulf
  ['kuwait', 'الكويت', 'Kuwait City', 'الكويت', 29.3759, 47.9774],
  ['doha', 'الدوحة', 'Doha', 'قطر', 25.2854, 51.531],
  ['manama', 'المنامة', 'Manama', 'البحرين', 26.2285, 50.586],
  ['abu-dhabi', 'أبوظبي', 'Abu Dhabi', 'الإمارات', 24.4539, 54.3773],
  ['dubai', 'دبي', 'Dubai', 'الإمارات', 25.2048, 55.2708],
  ['sharjah', 'الشارقة', 'Sharjah', 'الإمارات', 25.3463, 55.4209],
  ['muscat', 'مسقط', 'Muscat', 'عمان', 23.588, 58.3829],
  ['salalah', 'صلالة', 'Salalah', 'عمان', 17.0151, 54.0924],
  // Yemen, Iraq, Levant
  ['sanaa', 'صنعاء', "Sana'a Sanaa", 'اليمن', 15.3694, 44.191],
  ['aden', 'عدن', 'Aden', 'اليمن', 12.7855, 45.0187],
  ['mukalla', 'المكلا', 'Mukalla', 'اليمن', 14.5425, 49.1242],
  ['baghdad', 'بغداد', 'Baghdad', 'العراق', 33.3152, 44.3661],
  ['basra', 'البصرة', 'Basra', 'العراق', 30.5085, 47.7804],
  ['mosul', 'الموصل', 'Mosul', 'العراق', 36.3489, 43.1577],
  ['erbil', 'أربيل', 'Erbil', 'العراق', 36.1911, 44.0092],
  ['amman', 'عمّان', 'Amman', 'الأردن', 31.9454, 35.9284],
  ['irbid', 'إربد', 'Irbid', 'الأردن', 32.5556, 35.85],
  ['zarqa', 'الزرقاء', 'Zarqa', 'الأردن', 32.0728, 36.088],
  ['damascus', 'دمشق', 'Damascus', 'سوريا', 33.5138, 36.2765],
  ['aleppo', 'حلب', 'Aleppo', 'سوريا', 36.2021, 37.1343],
  ['homs', 'حمص', 'Homs', 'سوريا', 34.7324, 36.7137],
  ['beirut', 'بيروت', 'Beirut', 'لبنان', 33.8938, 35.5018],
  ['tripoli-lb', 'طرابلس', 'Tripoli', 'لبنان', 34.4367, 35.8497],
  ['jerusalem', 'القدس', 'Jerusalem Al-Quds', 'فلسطين', 31.7683, 35.2137],
  ['gaza', 'غزة', 'Gaza', 'فلسطين', 31.5017, 34.4668],
  ['nablus', 'نابلس', 'Nablus', 'فلسطين', 32.2211, 35.2544],
  ['hebron', 'الخليل', 'Hebron Al-Khalil', 'فلسطين', 31.5326, 35.0998],
  // Egypt and Sudan
  ['cairo', 'القاهرة', 'Cairo', 'مصر', 30.0444, 31.2357],
  ['alexandria', 'الإسكندرية', 'Alexandria', 'مصر', 31.2001, 29.9187],
  ['giza', 'الجيزة', 'Giza', 'مصر', 30.0131, 31.2089],
  ['mansoura', 'المنصورة', 'Mansoura', 'مصر', 31.0409, 31.3785],
  ['tanta', 'طنطا', 'Tanta', 'مصر', 30.7865, 31.0004],
  ['asyut', 'أسيوط', 'Asyut Assiut', 'مصر', 27.1783, 31.1859],
  ['aswan', 'أسوان', 'Aswan', 'مصر', 24.0889, 32.8998],
  ['khartoum', 'الخرطوم', 'Khartoum', 'السودان', 15.5007, 32.5599],
  ['port-sudan', 'بورتسودان', 'Port Sudan', 'السودان', 19.6158, 37.2164],
  // Maghreb
  ['tripoli-ly', 'طرابلس', 'Tripoli', 'ليبيا', 32.8872, 13.1913],
  ['benghazi', 'بنغازي', 'Benghazi', 'ليبيا', 32.1167, 20.0667],
  ['tunis', 'تونس', 'Tunis', 'تونس', 36.8065, 10.1815],
  ['sfax', 'صفاقس', 'Sfax', 'تونس', 34.7406, 10.7603],
  ['sousse', 'سوسة', 'Sousse', 'تونس', 35.8256, 10.6084],
  ['algiers', 'الجزائر', 'Algiers Alger', 'الجزائر', 36.7538, 3.0588],
  ['oran', 'وهران', 'Oran', 'الجزائر', 35.6971, -0.6308],
  ['constantine', 'قسنطينة', 'Constantine', 'الجزائر', 36.365, 6.6147],
  ['annaba', 'عنابة', 'Annaba', 'الجزائر', 36.9, 7.7667],
  ['setif', 'سطيف', 'Setif', 'الجزائر', 36.1911, 5.4137],
  ['batna', 'باتنة', 'Batna', 'الجزائر', 35.5559, 6.1741],
  ['blida', 'البليدة', 'Blida', 'الجزائر', 36.47, 2.8277],
  ['tlemcen', 'تلمسان', 'Tlemcen', 'الجزائر', 34.8828, -1.3167],
  ['bejaia', 'بجاية', 'Bejaia', 'الجزائر', 36.7509, 5.0567],
  ['ghardaia', 'غرداية', 'Ghardaia', 'الجزائر', 32.4909, 3.6735],
  ['rabat', 'الرباط', 'Rabat', 'المغرب', 34.0209, -6.8416],
  ['casablanca', 'الدار البيضاء', 'Casablanca', 'المغرب', 33.5731, -7.5898],
  ['fes', 'فاس', 'Fes Fez', 'المغرب', 34.0181, -5.0078],
  ['marrakech', 'مراكش', 'Marrakech Marrakesh', 'المغرب', 31.6295, -7.9811],
  ['tangier', 'طنجة', 'Tangier Tanger', 'المغرب', 35.7595, -5.834],
  ['meknes', 'مكناس', 'Meknes', 'المغرب', 33.8935, -5.5473],
  ['agadir', 'أكادير', 'Agadir', 'المغرب', 30.4278, -9.5981],
  ['oujda', 'وجدة', 'Oujda', 'المغرب', 34.6814, -1.9086],
  ['tetouan', 'تطوان', 'Tetouan', 'المغرب', 35.5785, -5.3684],
  ['nouakchott', 'نواكشوط', 'Nouakchott', 'موريتانيا', 18.0735, -15.9582],
  // Africa
  ['mogadishu', 'مقديشو', 'Mogadishu', 'الصومال', 2.0469, 45.3182],
  ['djibouti', 'جيبوتي', 'Djibouti', 'جيبوتي', 11.5721, 43.1456],
  ['dakar', 'داكار', 'Dakar', 'السنغال', 14.7167, -17.4677],
  ['bamako', 'باماكو', 'Bamako', 'مالي', 12.6392, -8.0029],
  ['niamey', 'نيامي', 'Niamey', 'النيجر', 13.5116, 2.1254],
  ['ndjamena', 'إنجامينا', "N'Djamena", 'تشاد', 12.1348, 15.0557],
  ['kano', 'كانو', 'Kano', 'نيجيريا', 12.0022, 8.592],
  ['lagos', 'لاغوس', 'Lagos', 'نيجيريا', 6.5244, 3.3792],
  ['nairobi', 'نيروبي', 'Nairobi', 'كينيا', -1.2921, 36.8219],
  ['dar-es-salaam', 'دار السلام', 'Dar es Salaam', 'تنزانيا', -6.7924, 39.2083],
  ['johannesburg', 'جوهانسبرغ', 'Johannesburg', 'جنوب أفريقيا', -26.2041, 28.0473],
  ['cape-town', 'كيب تاون', 'Cape Town', 'جنوب أفريقيا', -33.9249, 18.4241],
  // Turkey, Iran, Asia
  ['istanbul', 'إسطنبول', 'Istanbul', 'تركيا', 41.0082, 28.9784],
  ['ankara', 'أنقرة', 'Ankara', 'تركيا', 39.9334, 32.8597],
  ['gaziantep', 'غازي عنتاب', 'Gaziantep', 'تركيا', 37.0662, 37.3833],
  ['tehran', 'طهران', 'Tehran', 'إيران', 35.6892, 51.389],
  ['kabul', 'كابل', 'Kabul', 'أفغانستان', 34.5553, 69.2075],
  ['karachi', 'كراتشي', 'Karachi', 'باكستان', 24.8607, 67.0011],
  ['lahore', 'لاهور', 'Lahore', 'باكستان', 31.5204, 74.3587],
  ['islamabad', 'إسلام آباد', 'Islamabad', 'باكستان', 33.6844, 73.0479],
  ['delhi', 'دلهي', 'Delhi', 'الهند', 28.7041, 77.1025],
  ['mumbai', 'مومباي', 'Mumbai', 'الهند', 19.076, 72.8777],
  ['hyderabad', 'حيدر آباد', 'Hyderabad', 'الهند', 17.385, 78.4867],
  ['dhaka', 'دكا', 'Dhaka', 'بنغلاديش', 23.8103, 90.4125],
  ['kuala-lumpur', 'كوالالمبور', 'Kuala Lumpur', 'ماليزيا', 3.139, 101.6869],
  ['singapore', 'سنغافورة', 'Singapore', 'سنغافورة', 1.3521, 103.8198],
  ['jakarta', 'جاكرتا', 'Jakarta', 'إندونيسيا', -6.2088, 106.8456],
  ['surabaya', 'سورابايا', 'Surabaya', 'إندونيسيا', -7.2575, 112.7521],
  ['tashkent', 'طشقند', 'Tashkent', 'أوزبكستان', 41.2995, 69.2401],
  ['almaty', 'ألماتي', 'Almaty', 'كازاخستان', 43.222, 76.8512],
  ['baku', 'باكو', 'Baku', 'أذربيجان', 40.4093, 49.8671],
  // Europe
  ['london', 'لندن', 'London', 'المملكة المتحدة', 51.5074, -0.1278],
  ['birmingham', 'برمنغهام', 'Birmingham', 'المملكة المتحدة', 52.4862, -1.8904],
  ['manchester', 'مانشستر', 'Manchester', 'المملكة المتحدة', 53.4808, -2.2426],
  ['paris', 'باريس', 'Paris', 'فرنسا', 48.8566, 2.3522],
  ['marseille', 'مرسيليا', 'Marseille', 'فرنسا', 43.2965, 5.3698],
  ['lyon', 'ليون', 'Lyon', 'فرنسا', 45.764, 4.8357],
  ['brussels', 'بروكسل', 'Brussels Bruxelles', 'بلجيكا', 50.8503, 4.3517],
  ['amsterdam', 'أمستردام', 'Amsterdam', 'هولندا', 52.3676, 4.9041],
  ['berlin', 'برلين', 'Berlin', 'ألمانيا', 52.52, 13.405],
  ['frankfurt', 'فرانكفورت', 'Frankfurt', 'ألمانيا', 50.1109, 8.6821],
  ['munich', 'ميونخ', 'Munich München', 'ألمانيا', 48.1351, 11.582],
  ['vienna', 'فيينا', 'Vienna Wien', 'النمسا', 48.2082, 16.3738],
  ['stockholm', 'ستوكهولم', 'Stockholm', 'السويد', 59.3293, 18.0686],
  ['oslo', 'أوسلو', 'Oslo', 'النرويج', 59.9139, 10.7522],
  ['copenhagen', 'كوبنهاغن', 'Copenhagen', 'الدنمارك', 55.6761, 12.5683],
  ['madrid', 'مدريد', 'Madrid', 'إسبانيا', 40.4168, -3.7038],
  ['barcelona', 'برشلونة', 'Barcelona', 'إسبانيا', 41.3874, 2.1686],
  ['rome', 'روما', 'Rome Roma', 'إيطاليا', 41.9028, 12.4964],
  ['milan', 'ميلانو', 'Milan Milano', 'إيطاليا', 45.4642, 9.19],
  ['sarajevo', 'سراييفو', 'Sarajevo', 'البوسنة والهرسك', 43.8563, 18.4131],
  ['moscow', 'موسكو', 'Moscow', 'روسيا', 55.7558, 37.6173],
  ['kazan', 'قازان', 'Kazan', 'روسيا', 55.7963, 49.1088],
  // Americas and Oceania
  ['new-york', 'نيويورك', 'New York', 'الولايات المتحدة', 40.7128, -74.006],
  ['chicago', 'شيكاغو', 'Chicago', 'الولايات المتحدة', 41.8781, -87.6298],
  ['houston', 'هيوستن', 'Houston', 'الولايات المتحدة', 29.7604, -95.3698],
  ['los-angeles', 'لوس أنجلوس', 'Los Angeles', 'الولايات المتحدة', 34.0522, -118.2437],
  ['detroit', 'ديترويت', 'Detroit Dearborn', 'الولايات المتحدة', 42.3314, -83.0458],
  ['washington', 'واشنطن', 'Washington', 'الولايات المتحدة', 38.9072, -77.0369],
  ['toronto', 'تورونتو', 'Toronto', 'كندا', 43.6532, -79.3832],
  ['montreal', 'مونتريال', 'Montreal Montréal', 'كندا', 45.5017, -73.5673],
  ['sao-paulo', 'ساو باولو', 'Sao Paulo São Paulo', 'البرازيل', -23.5505, -46.6333],
  ['sydney', 'سيدني', 'Sydney', 'أستراليا', -33.8688, 151.2093],
  ['melbourne', 'ملبورن', 'Melbourne', 'أستراليا', -37.8136, 144.9631],
];

export const CITIES: readonly City[] = ROWS.map(([id, name, nameLatin, country, latitude, longitude]) => ({
  id,
  name,
  nameLatin,
  country,
  latitude,
  longitude,
}));

export function getCity(id: string): City | undefined {
  return CITIES.find((city) => city.id === id);
}

// Diacritics, tatweel and letter variants are ignored, so "مكة" finds
// "مكّة المكرّمة" and "مدينه" finds "المدينة"; Latin letters lose their
// accents and case, so "fes" finds "Fès".
function searchable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ًͯ-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const INDEX = CITIES.map((city) => ({
  city,
  text: searchable(`${city.name} ${city.nameLatin} ${city.country}`),
}));

// Cities whose Arabic or Latin name, or country, contains every word typed.
export function searchCities(query: string): City[] {
  const words = searchable(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  return INDEX.filter(({ text }) => words.every((word) => text.includes(word))).map(({ city }) => city);
}
