export type RegistrationLanguage = 'ua' | 'ru' | 'en';

export type RegistrationFullText = {
  error: string;
  success: string;
  invalid: string;
  done: string;
  title: string;
  subtitle: string;
  personal: string;
  fullName: string;
  enterName: string;
  email: string;
  phone: string;
  password: string;
  minPassword: string;
  confirmPassword: string;
  repeatPassword: string;
  address: string;
  street: string;
  streetPick: string;
  house: string;
  housePick: string;
  guarantor: string;
  guarantorPhone: string;
  optionalPhone: string;
  agree: string;
  register: string;
  haveAccount: string;
  login: string;
  show: string;
  hide: string;
  emailInUse: string;
  invalidEmail: string;
  weakPassword: string;
  networkError: string;
  tooManyRequests: string;
  permissionDenied: string;
  registerFailed: string;
  passwordBreached: string;
  passwordCheckUnavailable: string;
  referrerNotFound: string;
  invalidRedirect: string;
  quickReg: string;
  addressData: string;
  passwordMismatch: string;
};

const TEXTS: Record<RegistrationLanguage, RegistrationFullText> = {
  ua: {
    error: 'Помилка',
    success: 'Успішно',
    invalid: 'Заповніть усі поля коректно',
    done: 'Реєстрацію завершено',
    title: 'Повна реєстрація',
    subtitle: 'Створіть акаунт і вкажіть адресу в ЖК Чайка',
    personal: 'Особисті дані',
    fullName: "Повне ім'я",
    enterName: "Введіть ім'я",
    email: 'Email',
    phone: 'Телефон',
    password: 'Пароль',
    minPassword: 'Мінімум 8 символів: літера, цифра і спецсимвол',
    confirmPassword: 'Підтвердіть пароль',
    repeatPassword: 'Повторіть пароль',
    address: 'Адреса',
    street: 'Вулиця',
    streetPick: 'Виберіть вулицю...',
    house: 'Будинок',
    housePick: 'Виберіть будинок...',
    guarantor: 'Поручитель',
    guarantorPhone: 'Телефон людини, яка вас запросила',
    optionalPhone: '+380... (необов’язково)',
    agree: 'Я погоджуюсь з умовами використання',
    register: 'Зареєструватися',
    haveAccount: 'Вже є акаунт? ',
    login: 'Увійти',
    show: 'Показати',
    hide: 'Сховати',
    emailInUse: 'Цей email вже використовується. Спробуйте зареєструватися з новим email або увійти через Google/Facebook.',
    invalidEmail: 'Некоректний email.',
    weakPassword: 'Пароль занадто простий.',
    networkError: 'Немає з’єднання з інтернетом. Перевірте мережу і спробуйте ще раз.',
    tooManyRequests: 'Забагато спроб. Зачекайте кілька хвилин і спробуйте знову.',
    permissionDenied: 'Немає доступу для завершення реєстрації. Спробуйте увійти ще раз.',
    registerFailed: 'Не вдалося зареєструватися. Спробуйте пізніше.',
    passwordBreached: 'Цей пароль знайдено у витоках. Оберіть інший, унікальний пароль.',
    passwordCheckUnavailable: 'Не вдалося перевірити пароль на витоки. Спробуйте пізніше.',
    referrerNotFound: 'Користувача з таким номером телефону не знайдено в базі.',
    invalidRedirect: 'Не вдалося відкрити потрібний екран. Відкриваємо профіль.',
    quickReg: 'Швидка реєстрація',
    addressData: 'Адреса і дані',
    passwordMismatch: 'Паролі не збігаються',
  },
  ru: {
    error: 'Ошибка',
    success: 'Успешно',
    invalid: 'Заполните все поля корректно',
    done: 'Регистрация завершена',
    title: 'Полная регистрация',
    subtitle: 'Создайте аккаунт и укажите адрес в ЖК Чайка',
    personal: 'Личные данные',
    fullName: 'Полное имя',
    enterName: 'Введите имя',
    email: 'Email',
    phone: 'Телефон',
    password: 'Пароль',
    minPassword: 'Минимум 8 символов: буква, цифра и спецсимвол',
    confirmPassword: 'Подтвердите пароль',
    repeatPassword: 'Повторите пароль',
    address: 'Адрес',
    street: 'Улица',
    streetPick: 'Выберите улицу...',
    house: 'Дом',
    housePick: 'Выберите дом...',
    guarantor: 'Поручитель',
    guarantorPhone: 'Телефон человека, который вас пригласил',
    optionalPhone: '+380... (необязательно)',
    agree: 'Я соглашаюсь с условиями использования',
    register: 'Зарегистрироваться',
    haveAccount: 'Уже есть аккаунт? ',
    login: 'Войти',
    show: 'Показать',
    hide: 'Скрыть',
    emailInUse: 'Этот email уже используется. Попробуйте зарегистрироваться с новым email или войти через Google/Facebook.',
    invalidEmail: 'Некорректный email.',
    weakPassword: 'Пароль слишком простой.',
    networkError: 'Нет подключения к интернету. Проверьте сеть и попробуйте ещё раз.',
    tooManyRequests: 'Слишком много попыток. Подождите несколько минут и попробуйте снова.',
    permissionDenied: 'Нет доступа для завершения регистрации. Попробуйте войти ещё раз.',
    registerFailed: 'Не удалось зарегистрироваться. Попробуйте позже.',
    passwordBreached: 'Этот пароль найден в утечках. Выберите другой, уникальный пароль.',
    passwordCheckUnavailable: 'Не удалось проверить пароль на утечки. Попробуйте позже.',
    referrerNotFound: 'Пользователь с таким номером телефона не найден в базе.',
    invalidRedirect: 'Не удалось открыть нужный экран. Открываем профиль.',
    quickReg: 'Быстрая регистрация',
    addressData: 'Адрес и данные',
    passwordMismatch: 'Пароли не совпадают',
  },
  en: {
    error: 'Error',
    success: 'Success',
    invalid: 'Please fill in all fields correctly',
    done: 'Registration completed',
    title: 'Full registration',
    subtitle: 'Create an account and specify your address in Chaika Life',
    personal: 'Personal details',
    fullName: 'Full name',
    enterName: 'Enter your name',
    email: 'Email',
    phone: 'Phone',
    password: 'Password',
    minPassword: 'At least 8 chars: letter, digit and special char',
    confirmPassword: 'Confirm password',
    repeatPassword: 'Repeat password',
    address: 'Address',
    street: 'Street',
    streetPick: 'Select a street...',
    house: 'Building',
    housePick: 'Select a building...',
    guarantor: 'Referrer',
    guarantorPhone: 'Phone of the person who invited you',
    optionalPhone: '+380... (optional)',
    agree: 'I agree to the terms of use',
    register: 'Register',
    haveAccount: 'Already have an account? ',
    login: 'Sign in',
    show: 'Show',
    hide: 'Hide',
    emailInUse: 'This email is already in use. Try signing up with a new email or sign in with Google/Facebook.',
    invalidEmail: 'Invalid email.',
    weakPassword: 'Password is too weak.',
    networkError: 'No internet connection. Check your network and try again.',
    tooManyRequests: 'Too many attempts. Wait a few minutes and try again.',
    permissionDenied: 'Registration access was denied. Try signing in again.',
    registerFailed: 'Could not register. Please try again later.',
    passwordBreached: 'This password appears in known breaches. Choose a different, unique password.',
    passwordCheckUnavailable: 'Could not check the password against breach databases. Please try again later.',
    referrerNotFound: 'No user with this phone number found in the database.',
    invalidRedirect: 'Could not open the requested screen. Opening your profile.',
    quickReg: 'Quick registration',
    addressData: 'Address and details',
    passwordMismatch: 'Passwords do not match',
  },
};

export const getRegistrationFullText = (language: string | undefined): RegistrationFullText => {
  if (language === 'ru' || language === 'en' || language === 'ua') {
    return TEXTS[language];
  }

  return TEXTS.ua;
};
