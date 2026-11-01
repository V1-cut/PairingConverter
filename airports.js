// Airport (IATA) → IANA time zone + short city name.
// Times in booking emails are local to each airport, so this is what turns them into UTC.
// Add missing airports to the right zone: 'CODE City|CODE City'. Unknown codes are asked for in the UI.

const ZONES = {
  'America/New_York':
    'ATL Atlanta|BOS Boston|BWI Baltimore|CLT Charlotte|CLE Cleveland|CMH Columbus|CVG Cincinnati|ILN Wilmington OH|' +
    'DCA Washington National|IAD Washington Dulles|DTW Detroit|EWR Newark|FLL Fort Lauderdale|JAX Jacksonville|' +
    'JFK New York JFK|LGA New York LaGuardia|MCO Orlando|MIA Miami|PBI West Palm Beach|PHL Philadelphia|PIT Pittsburgh|' +
    'PVD Providence|RDU Raleigh-Durham|RIC Richmond|ROC Rochester|BUF Buffalo|SYR Syracuse|ALB Albany|BDL Hartford|' +
    'BTV Burlington|PWM Portland ME|MHT Manchester NH|ORF Norfolk|SAV Savannah|CHS Charleston|MYR Myrtle Beach|' +
    'TPA Tampa|RSW Fort Myers|SRQ Sarasota|PIE St. Petersburg|SFB Sanford|TLH Tallahassee|DAB Daytona Beach|' +
    'MLB Melbourne FL|EYW Key West|GSO Greensboro|GSP Greenville-Spartanburg|IND Indianapolis|SDF Louisville|' +
    'LEX Lexington|TYS Knoxville|CHA Chattanooga|TRI Tri-Cities|CAK Akron-Canton|DAY Dayton|GRR Grand Rapids|' +
    'FNT Flint|LAN Lansing|HPN White Plains|ISP Islip|SWF Newburgh|ABE Allentown|AVL Asheville|ILM Wilmington NC|CAE Columbia SC',
  'America/Chicago':
    "ORD Chicago O'Hare|MDW Chicago Midway|DFW Dallas/Fort Worth|DAL Dallas Love|AFW Fort Worth Alliance|" +
    'IAH Houston|HOU Houston Hobby|AUS Austin|SAT San Antonio|MSP Minneapolis|MKE Milwaukee|MCI Kansas City|' +
    'STL St. Louis|MSY New Orleans|BNA Nashville|MEM Memphis|OKC Oklahoma City|TUL Tulsa|OMA Omaha|DSM Des Moines|' +
    'CID Cedar Rapids|MSN Madison|GRB Green Bay|ATW Appleton|RFD Rockford|PIA Peoria|BHM Birmingham|HSV Huntsville|' +
    'MOB Mobile|PNS Pensacola|VPS Destin-Fort Walton|ECP Panama City|LIT Little Rock|XNA Northwest Arkansas|' +
    'SGF Springfield MO|ICT Wichita|FSD Sioux Falls|FAR Fargo|BIS Bismarck|CRP Corpus Christi|HRL Harlingen|' +
    'MFE McAllen|BRO Brownsville|LBB Lubbock|AMA Amarillo|MAF Midland|ABI Abilene|ACT Waco|JAN Jackson MS|' +
    'GPT Gulfport|BTR Baton Rouge|LFT Lafayette|SHV Shreveport|LCH Lake Charles|MLI Moline|CMI Champaign|' +
    'SPI Springfield IL|EVV Evansville|RST Rochester MN|DLH Duluth',
  'America/Denver':
    'DEN Denver|SLC Salt Lake City|ABQ Albuquerque|ELP El Paso|COS Colorado Springs|BOI Boise|BZN Bozeman|' +
    'BIL Billings|MSO Missoula|GJT Grand Junction|ASE Aspen|EGE Vail|JAC Jackson Hole|HDN Hayden|CPR Casper|' +
    'RAP Rapid City|GTF Great Falls|HLN Helena|IDA Idaho Falls|SAF Santa Fe|MTJ Montrose|DRO Durango',
  'America/Phoenix': 'PHX Phoenix|TUS Tucson|AZA Phoenix-Mesa|FLG Flagstaff|YUM Yuma',
  'America/Los_Angeles':
    'LAX Los Angeles|SFO San Francisco|OAK Oakland|SJC San Jose|SAN San Diego|SMF Sacramento|SNA Santa Ana|' +
    'BUR Burbank|LGB Long Beach|ONT Ontario|PSP Palm Springs|SBA Santa Barbara|FAT Fresno|SBP San Luis Obispo|' +
    'MRY Monterey|STS Santa Rosa|RNO Reno|LAS Las Vegas|SEA Seattle|PDX Portland|GEG Spokane|BLI Bellingham|' +
    'PSC Pasco|EUG Eugene|MFR Medford|RDM Redmond|BFI Seattle Boeing Field|PAE Everett',
  'America/Anchorage':
    'ANC Anchorage|FAI Fairbanks|JNU Juneau|KTN Ketchikan|SIT Sitka|BET Bethel|OME Nome|OTZ Kotzebue|' +
    'ADQ Kodiak|DLG Dillingham|AKN King Salmon|SCC Prudhoe Bay|BRW Utqiagvik',
  'Pacific/Honolulu': 'HNL Honolulu|OGG Kahului|KOA Kona|LIH Lihue|ITO Hilo',
  'Pacific/Guam': 'GUM Guam',
  'America/Puerto_Rico': 'SJU San Juan|BQN Aguadilla|STT St. Thomas|STX St. Croix',
  'America/Toronto': 'YYZ Toronto|YOW Ottawa|YUL Montreal',
  'America/Halifax': 'YHZ Halifax',
  'America/St_Johns': "YYT St. John's",
  'America/Winnipeg': 'YWG Winnipeg',
  'America/Edmonton': 'YYC Calgary|YEG Edmonton',
  'America/Vancouver': 'YVR Vancouver|YYJ Victoria|YLW Kelowna',
  'America/Nassau': 'NAS Nassau',
  'America/Mexico_City': 'MEX Mexico City|GDL Guadalajara|MTY Monterrey|PVR Puerto Vallarta',
  'America/Cancun': 'CUN Cancun',
  'America/Mazatlan': 'SJD Los Cabos',
  'America/Tijuana': 'TIJ Tijuana',
  'America/Panama': 'PTY Panama City',
  'America/Costa_Rica': 'SJO San Jose CR|LIR Liberia',
  'America/Guatemala': 'GUA Guatemala City',
  'America/El_Salvador': 'SAL San Salvador',
  'America/Tegucigalpa': 'SAP San Pedro Sula',
  'America/Santo_Domingo': 'SDQ Santo Domingo|PUJ Punta Cana',
  'America/Jamaica': 'MBJ Montego Bay|KIN Kingston',
  'America/Aruba': 'AUA Aruba',
  'America/Curacao': 'CUR Curacao',
  'America/Barbados': 'BGI Barbados',
  'America/Cayman': 'GCM Grand Cayman',
  'America/Bogota': 'BOG Bogota|MDE Medellin',
  'America/Guayaquil': 'UIO Quito|GYE Guayaquil',
  'America/Lima': 'LIM Lima',
  'America/Caracas': 'CCS Caracas',
  'America/Santiago': 'SCL Santiago',
  'America/Sao_Paulo': 'GRU Sao Paulo|VCP Campinas|GIG Rio de Janeiro',
  'America/Argentina/Buenos_Aires': 'EZE Buenos Aires|AEP Buenos Aires Aeroparque',
  'Atlantic/Reykjavik': 'KEF Reykjavik',
  'Europe/London':
    'LHR London Heathrow|LGW London Gatwick|STN London Stansted|LTN London Luton|LCY London City|' +
    'MAN Manchester|EDI Edinburgh|GLA Glasgow|BHX Birmingham UK|EMA East Midlands|PIK Prestwick',
  'Europe/Dublin': 'DUB Dublin|SNN Shannon',
  'Europe/Lisbon': 'LIS Lisbon|OPO Porto',
  'Europe/Paris': 'CDG Paris CDG|ORY Paris Orly|NCE Nice|LYS Lyon',
  'Europe/Amsterdam': 'AMS Amsterdam',
  'Europe/Brussels': 'BRU Brussels|LGG Liege',
  'Europe/Luxembourg': 'LUX Luxembourg',
  'Europe/Berlin': 'FRA Frankfurt|MUC Munich|BER Berlin|DUS Dusseldorf|HAM Hamburg|CGN Cologne|LEJ Leipzig|HHN Hahn',
  'Europe/Zurich': 'ZRH Zurich|GVA Geneva',
  'Europe/Vienna': 'VIE Vienna',
  'Europe/Rome': 'FCO Rome|MXP Milan Malpensa|LIN Milan Linate|VCE Venice',
  'Europe/Madrid': 'MAD Madrid|BCN Barcelona|AGP Malaga|PMI Palma',
  'Europe/Copenhagen': 'CPH Copenhagen',
  'Europe/Stockholm': 'ARN Stockholm',
  'Europe/Oslo': 'OSL Oslo',
  'Europe/Helsinki': 'HEL Helsinki',
  'Europe/Warsaw': 'WAW Warsaw',
  'Europe/Prague': 'PRG Prague',
  'Europe/Budapest': 'BUD Budapest',
  'Europe/Athens': 'ATH Athens',
  'Europe/Istanbul': 'IST Istanbul|SAW Istanbul Sabiha',
  'Asia/Dubai': 'DXB Dubai|DWC Dubai World Central|AUH Abu Dhabi',
  'Asia/Qatar': 'DOH Doha',
  'Asia/Riyadh': 'RUH Riyadh|JED Jeddah',
  'Asia/Bahrain': 'BAH Bahrain',
  'Asia/Kuwait': 'KWI Kuwait',
  'Asia/Muscat': 'MCT Muscat',
  'Asia/Jerusalem': 'TLV Tel Aviv',
  'Africa/Cairo': 'CAI Cairo',
  'Africa/Johannesburg': 'JNB Johannesburg|CPT Cape Town',
  'Africa/Nairobi': 'NBO Nairobi',
  'Africa/Addis_Ababa': 'ADD Addis Ababa',
  'Africa/Lagos': 'LOS Lagos',
  'Africa/Casablanca': 'CMN Casablanca',
  'Asia/Kolkata': 'DEL Delhi|BOM Mumbai|BLR Bangalore|MAA Chennai|HYD Hyderabad|CCU Kolkata',
  'Asia/Karachi': 'KHI Karachi',
  'Asia/Dhaka': 'DAC Dhaka',
  'Asia/Colombo': 'CMB Colombo',
  'Asia/Kathmandu': 'KTM Kathmandu',
  'Asia/Almaty': 'ALA Almaty',
  'Asia/Tashkent': 'TAS Tashkent',
  'Asia/Novosibirsk': 'OVB Novosibirsk',
  'Asia/Krasnoyarsk': 'KJA Krasnoyarsk',
  'Asia/Tokyo': 'NRT Tokyo Narita|HND Tokyo Haneda|KIX Osaka Kansai|NGO Nagoya|FUK Fukuoka|CTS Sapporo|OKA Okinawa',
  'Asia/Seoul': 'ICN Seoul Incheon|GMP Seoul Gimpo',
  'Asia/Shanghai':
    'PVG Shanghai Pudong|SHA Shanghai Hongqiao|PEK Beijing|PKX Beijing Daxing|CAN Guangzhou|SZX Shenzhen|' +
    'CTU Chengdu|TFU Chengdu Tianfu|XIY Xian|CGO Zhengzhou|HGH Hangzhou|NKG Nanjing|TAO Qingdao|XMN Xiamen|' +
    'KMG Kunming|WUH Wuhan|CKG Chongqing|TSN Tianjin|SHE Shenyang|DLC Dalian|EHU Ezhou',
  'Asia/Hong_Kong': 'HKG Hong Kong',
  'Asia/Macau': 'MFM Macau',
  'Asia/Taipei': 'TPE Taipei|TSA Taipei Songshan|KHH Kaohsiung',
  'Asia/Manila': 'MNL Manila|CEB Cebu|CRK Clark',
  'Asia/Singapore': 'SIN Singapore',
  'Asia/Kuala_Lumpur': 'KUL Kuala Lumpur',
  'Asia/Bangkok': 'BKK Bangkok|DMK Bangkok Don Mueang',
  'Asia/Ho_Chi_Minh': 'SGN Ho Chi Minh City|HAN Hanoi',
  'Asia/Jakarta': 'CGK Jakarta',
  'Asia/Makassar': 'DPS Bali',
  'Australia/Sydney': 'SYD Sydney',
  'Australia/Melbourne': 'MEL Melbourne',
  'Australia/Brisbane': 'BNE Brisbane',
  'Australia/Adelaide': 'ADL Adelaide',
  'Australia/Perth': 'PER Perth',
  'Pacific/Auckland': 'AKL Auckland|CHC Christchurch',
  'Pacific/Fiji': 'NAN Nadi',
};

export const AIRPORTS = {};
for (const [tz, list] of Object.entries(ZONES)) {
  for (const entry of list.split('|')) {
    AIRPORTS[entry.slice(0, 3)] = { tz, city: entry.slice(4) };
  }
}

// Airline name → IATA code, for "Delta 1234", "American Airlines flight 4765", or a bare "Flight # 2345".
export const AIRLINE_NAMES = {
  'american': 'AA', 'delta': 'DL', 'united': 'UA', 'alaska': 'AS', 'southwest': 'WN', 'jetblue': 'B6',
  'spirit': 'NK', 'frontier': 'F9', 'hawaiian': 'HA', 'allegiant': 'G4', 'sun country': 'SY', 'breeze': 'MX',
  'air canada': 'AC', 'westjet': 'WS', 'british airways': 'BA', 'virgin atlantic': 'VS', 'lufthansa': 'LH',
  'air france': 'AF', 'klm': 'KL', 'japan airlines': 'JL', 'all nippon': 'NH', 'cathay pacific': 'CX', 'qantas': 'QF',
  'emirates': 'EK', 'qatar airways': 'QR', 'singapore airlines': 'SQ', 'korean air': 'KE', 'aeromexico': 'AM',
  'iberia': 'IB', 'finnair': 'AY', 'icelandair': 'FI', 'aer lingus': 'EI', 'turkish airlines': 'TK',
  'copa': 'CM', 'avianca': 'AV', 'atlas air': '5Y',
};

// Codes accepted in "AA 4765" / "DL1234" form. Restricting to known carriers keeps "PM 2", "OR 97" etc. out.
export const AIRLINE_CODES = new Set([
  ...Object.values(AIRLINE_NAMES),
  'MQ', 'OO', 'YX', '9E', 'OH', 'YV', 'QX', 'ZW', 'G7', 'C5', 'PT', 'CP', 'AX', 'EV', 'KS', '3M',
  'LX', 'OS', 'SK', 'LA', 'NZ', 'CI', 'BR', 'OZ', 'CA', 'MU', 'CZ', 'EY', 'SV', 'ET', 'TP', 'AZ', 'UX',
  'PO', 'FX', '5X', 'K4', 'CV', 'GB',
]);
