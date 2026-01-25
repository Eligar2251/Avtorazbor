/**
 * Конфигурация Firebase и Cloudinary
 */

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyB6HW6v3JRrXN-k4zxZhNaD50ZwqLoGmV0",
        authDomain: "avtorazbor-8ce22.firebaseapp.com",
        projectId: "avtorazbor-8ce22",
        storageBucket: "avtorazbor-8ce22.firebasestorage.app",
        messagingSenderId: "92023938497",
        appId: "1:92023938497:web:aa848a6c4806d65c1ea340",
        measurementId: "G-8KD9D5EZ58"
};

// Cloudinary Configuration
const cloudinaryConfig = {
    cloudName: "YOUR_CLOUD_NAME",
    uploadPreset: "YOUR_UPLOAD_PRESET"
};

// Initialize Firebase
let db, auth;

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Firebase initialization error:', error);
}

// Database collections
const DB = {
    PARTS: 'parts',
    CARS: 'cars',
    RESERVATIONS: 'reservations',
    SALES: 'sales',
    USERS: 'users'
};

// Car brands and models
const CAR_BRANDS = {
    'ВАЗ': [
        '2101', '2102', '2103', '2104', '2105', '2106', '2107',
        '2108', '2109', '21099', '2110', '2111', '2112',
        '2113', '2114', '2115', 'Калина', 'Приора', 'Гранта', 'Веста', 'Нива'
    ],
    'Toyota': [
        'Camry', 'Corolla', 'RAV4', 'Land Cruiser', 'Land Cruiser Prado',
        'Hilux', 'Highlander', 'Avensis', 'Yaris', 'Crown', 'Mark II'
    ]
};

// Body types
const BODY_TYPES = [
    'Седан', 'Хэтчбек', 'Универсал', 'Купе', 
    'Внедорожник', 'Кроссовер', 'Минивэн', 'Пикап'
];

// Parts list
const PARTS_LIST = [
    { id: 'bumper_front', name: 'Бампер передний', cat: 'Кузов' },
    { id: 'headlights', name: 'Фары передние', cat: 'Освещение', assembly: true },
    { id: 'grille', name: 'Решетка радиатора', cat: 'Кузов' },
    { id: 'hood', name: 'Капот', cat: 'Кузов' },
    { id: 'fender_front', name: 'Крыло переднее', cat: 'Кузов' },
    { id: 'wipers', name: 'Дворники', cat: 'Кузов' },
    { id: 'windshield', name: 'Лобовое стекло', cat: 'Стекла' },
    { id: 'roof', name: 'Крыша', cat: 'Кузов' },
    { id: 'door_front', name: 'Дверь передняя', cat: 'Кузов', assembly: true },
    { id: 'door_rear', name: 'Дверь задняя', cat: 'Кузов', assembly: true },
    { id: 'body', name: 'Кузов', cat: 'Кузов', assembly: true },
    { id: 'fender_rear', name: 'Крылья задние', cat: 'Кузов' },
    { id: 'trunk_lid', name: 'Крышка багажника', cat: 'Кузов' },
    { id: 'bumper_rear', name: 'Бампер задний', cat: 'Кузов' },
    { id: 'taillights', name: 'Задние фонари', cat: 'Освещение', assembly: true },
    { id: 'mirrors', name: 'Боковые зеркала', cat: 'Кузов', assembly: true },
    { id: 'rear_window', name: 'Стекло заднее', cat: 'Стекла' },
    { id: 'engine', name: 'Двигатель', cat: 'Двигатель', assembly: true },
    { id: 'gearbox', name: 'КПП', cat: 'Трансмиссия', assembly: true },
    { id: 'generator', name: 'Генератор', cat: 'Электрика' },
    { id: 'starter', name: 'Стартер', cat: 'Электрика' },
    { id: 'wiring', name: 'Коса', cat: 'Электрика' },
    { id: 'ecu', name: 'ЭБУ', cat: 'Электрика' },
    { id: 'maf', name: 'ДМРВ', cat: 'Двигатель' },
    { id: 'cylinder_head', name: 'ГБЦ', cat: 'Двигатель' },
    { id: 'carburetor', name: 'Карбюратор', cat: 'Двигатель' },
    { id: 'shock_absorbers', name: 'Стойки амортизаторов', cat: 'Подвеска', assembly: true },
    { id: 'axle_front', name: 'Мост передний', cat: 'Подвеска', assembly: true },
    { id: 'axle_rear', name: 'Мост задний', cat: 'Подвеска', assembly: true },
    { id: 'fuel_tank', name: 'Топливный бак', cat: 'Топливная система' },
    { id: 'leaf_springs', name: 'Рессоры', cat: 'Подвеска', assembly: true },
    { id: 'reducer', name: 'Редуктор', cat: 'Трансмиссия' },
    { id: 'steering_gear', name: 'Рулевой редуктор', cat: 'Рулевое' },
    { id: 'driveshaft', name: 'Кардан', cat: 'Трансмиссия' },
    { id: 'wheels', name: 'Колеса', cat: 'Ходовая', assembly: true },
    { id: 'dashboard', name: 'Панель приборов', cat: 'Салон' },
    { id: 'torpedo', name: 'Торпеда', cat: 'Салон' },
    { id: 'seat_front', name: 'Сидение переднее', cat: 'Салон', assembly: true },
    { id: 'seat_rear', name: 'Сидение заднее', cat: 'Салон' },
    { id: 'steering_wheel', name: 'Руль', cat: 'Салон' }
];

// Categories
const CATEGORIES = [
    'Все', 'Кузов', 'Освещение', 'Стекла', 'Двигатель', 
    'Трансмиссия', 'Электрика', 'Подвеска', 'Топливная система', 
    'Рулевое', 'Ходовая', 'Салон'
];

// Part conditions
const CONDITIONS = [
    { id: 'new', name: 'Новое', color: '#16a34a' },
    { id: 'excellent', name: 'Отличное', color: '#2563eb' },
    { id: 'good', name: 'Хорошее', color: '#7c3aed' },
    { id: 'satisfactory', name: 'Удовлетворительное', color: '#d97706' },
    { id: 'for_parts', name: 'На запчасти', color: '#dc2626' }
];