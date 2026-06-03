import { Alert } from 'react-native';

export type AppLanguage = 'ua' | 'ru' | 'en';

export type UserErrorContext =
  | 'load'
  | 'save'
  | 'send'
  | 'delete'
  | 'upload'
  | 'payment'
  | 'moderation'
  | 'auth'
  | 'network'
  | 'validation'
  | 'unknown';

const MESSAGES = {
  ua: {
    title: 'Помилка',
    load: 'Не вдалося завантажити дані. Перевірте інтернет і спробуйте ще раз.',
    save: 'Не вдалося зберегти зміни. Перевірте інтернет і спробуйте ще раз.',
    send: 'Не вдалося надіслати форму. Перевірте дані та спробуйте ще раз.',
    delete: 'Не вдалося видалити запис. Спробуйте ще раз.',
    upload: 'Не вдалося завантажити файл або фото. Перевірте інтернет і спробуйте ще раз.',
    payment: 'Не вдалося виконати оплату. Перевірте спосіб оплати або спробуйте пізніше.',
    moderation: 'Не вдалося оновити статус модерації. Спробуйте ще раз.',
    auth: 'Не вдалося виконати вхід. Перевірте дані або спробуйте інший спосіб входу.',
    network: "Немає з'єднання з Інтернетом. Перевірте мережу та спробуйте ще раз.",
    validation: 'Перевірте заповнення форми: деякі поля пропущені або заповнені неправильно.',
    missingRequiredFields: "Перевірте обов'язкові поля форми.",
    cooldownActive: 'Ви надсилаєте заявки занадто часто. Зачекайте трохи й спробуйте ще раз.',
    uploadFailed: 'Не вдалося завантажити файл. Перевірте інтернет і спробуйте ще раз.',
    photoUploadFailed: 'Не вдалося завантажити фото. Перевірте права доступу, фото та інтернет.',
    loginRequired: 'Потрібно увійти або зареєструватися, щоб надіслати цю форму.',
    noPermission: 'Не вдалося виконати дію. Перевірте інтернет і спробуйте ще раз.',
    permissionDenied: 'Немає доступу. Спробуйте перезайти в акаунт.',
    unavailable: 'Сервер тимчасово недоступний. Спробуйте пізніше.',
    unauthenticated: 'Потрібно увійти в акаунт.',
    notFound: 'Запис не знайдено або його було видалено.',
    invalidPrice: 'Вкажіть коректну ціну від 0.01 до 99 999 999.99.',
    rateLimit: 'Ви надсилаєте заявки занадто часто. Зачекайте трохи й спробуйте ще раз.',
    imageBlocked: 'Фото не пройшло перевірку безпеки. Оберіть інше фото без забороненого або чутливого контенту.',
    fileTooLarge: 'Не вдалося завантажити це фото. Спробуйте ще раз або оберіть інше фото.',
    unsupportedFile: 'Цей тип файлу не підтримується. Завантажте фото у форматі JPG, PNG або WEBP.',
    moderationBlocked: 'Матеріал не можна опублікувати в такому вигляді. Перевірте текст, фото та контактні дані.',
    unknown: 'Щось пішло не так. Спробуйте ще раз або зверніться до підтримки.',
    pending: 'Матеріал очікує модерації. Після перевірки він стане доступним у застосунку.',
    approved: 'Матеріал схвалено і доступний у застосунку.',
    rejected: 'Матеріал відхилено модератором.',
    rejectedWithReason: (reason: string) => `Матеріал відхилено модератором. Причина: ${reason}`,
    noRejectReason: 'Причина не вказана. Перевірте текст, фото та контактні дані або надішліть матеріал повторно.',
    defaultRejectReason: 'матеріал не відповідає правилам публікації Chaika Life',
  },
  ru: {
    title: 'Ошибка',
    load: 'Не удалось загрузить данные. Проверьте интернет и попробуйте ещё раз.',
    save: 'Не удалось сохранить изменения. Проверьте интернет и попробуйте ещё раз.',
    send: 'Не удалось отправить форму. Проверьте данные и попробуйте ещё раз.',
    delete: 'Не удалось удалить запись. Попробуйте ещё раз.',
    upload: 'Не удалось загрузить файл или фото. Проверьте интернет и попробуйте ещё раз.',
    payment: 'Не удалось выполнить оплату. Проверьте способ оплаты или попробуйте позже.',
    moderation: 'Не удалось обновить статус модерации. Попробуйте ещё раз.',
    auth: 'Не удалось выполнить вход. Проверьте данные или попробуйте другой способ входа.',
    network: 'Нет соединения с интернетом. Проверьте сеть и попробуйте ещё раз.',
    validation: 'Проверьте заполнение формы: некоторые поля пропущены или заполнены неправильно.',
    missingRequiredFields: 'Проверьте обязательные поля формы.',
    cooldownActive: 'Вы отправляете заявки слишком часто. Подождите немного и попробуйте снова.',
    uploadFailed: 'Не удалось загрузить файл. Проверьте интернет и попробуйте ещё раз.',
    photoUploadFailed: 'Не удалось загрузить фото. Проверьте права доступа, фото и интернет.',
    loginRequired: 'Нужно войти или зарегистрироваться, чтобы отправить эту форму.',
    noPermission: 'Не удалось выполнить действие. Проверьте интернет и попробуйте ещё раз.',
    permissionDenied: 'Нет доступа. Попробуйте перезайти в аккаунт.',
    unavailable: 'Сервер временно недоступен. Попробуйте позже.',
    unauthenticated: 'Необходимо войти в аккаунт.',
    notFound: 'Запись не найдена или была удалена.',
    invalidPrice: 'Укажите корректную цену от 0.01 до 99 999 999.99.',
    rateLimit: 'Вы отправляете заявки слишком часто. Подождите немного и попробуйте снова.',
    imageBlocked: 'Фото не прошло проверку безопасности. Выберите другое фото без запрещённого или чувствительного контента.',
    fileTooLarge: 'Не удалось загрузить это фото. Попробуйте ещё раз или выберите другое фото.',
    unsupportedFile: 'Этот тип файла не поддерживается. Загрузите фото в формате JPG, PNG или WEBP.',
    moderationBlocked: 'Материал нельзя опубликовать в таком виде. Проверьте текст, фото и контактные данные.',
    unknown: 'Что-то пошло не так. Попробуйте ещё раз или обратитесь в поддержку.',
    pending: 'Материал ожидает модерации. После проверки он станет доступен в приложении.',
    approved: 'Материал одобрен и доступен в приложении.',
    rejected: 'Материал отклонён модератором.',
    rejectedWithReason: (reason: string) => `Материал отклонён модератором. Причина: ${reason}`,
    noRejectReason: 'Причина не указана. Проверьте текст, фото и контактные данные или отправьте материал повторно.',
    defaultRejectReason: 'материал не соответствует правилам публикации Chaika Life',
  },
  en: {
    title: 'Error',
    load: 'Could not load the data. Check your internet connection and try again.',
    save: 'Could not save the changes. Check your internet connection and try again.',
    send: 'Could not submit the form. Check the data and try again.',
    delete: 'Could not delete the item. Please try again.',
    upload: 'Could not upload the file or photo. Check your internet connection and try again.',
    payment: 'Could not complete the payment. Check your payment method or try again later.',
    moderation: 'Could not update moderation status. Please try again.',
    auth: 'Could not sign in. Check your details or try another sign-in method.',
    network: 'No internet connection. Check your network and try again.',
    validation: 'Check the form: some fields are missing or filled in incorrectly.',
    missingRequiredFields: 'Check the required form fields.',
    cooldownActive: 'You are sending requests too often. Please wait a moment and try again.',
    uploadFailed: 'Could not upload the file. Check your internet connection and try again.',
    photoUploadFailed: 'Could not upload the photo. Check permissions, the photo, and your internet connection.',
    loginRequired: 'You need to sign in or register to submit this form.',
    noPermission: 'Could not complete the action. Check your internet connection and try again.',
    permissionDenied: 'No access. Try signing in again.',
    unavailable: 'The server is temporarily unavailable. Try again later.',
    unauthenticated: 'You need to sign in.',
    notFound: 'The item was not found or has been deleted.',
    invalidPrice: 'Enter a valid price from 0.01 to 99,999,999.99.',
    rateLimit: 'You are sending requests too often. Please wait a moment and try again.',
    imageBlocked: 'The photo did not pass the safety check. Choose another photo without prohibited or sensitive content.',
    fileTooLarge: 'Could not upload this photo. Try again or choose another photo.',
    unsupportedFile: 'This file type is not supported. Upload a JPG, PNG, or WEBP photo.',
    moderationBlocked: 'This content cannot be published as is. Check the text, photo, and contact details.',
    unknown: 'Something went wrong. Try again or contact support.',
    pending: 'This content is waiting for moderation. It will appear in the app after review.',
    approved: 'This content has been approved and is available in the app.',
    rejected: 'This content was rejected by a moderator.',
    rejectedWithReason: (reason: string) => `This content was rejected by a moderator. Reason: ${reason}`,
    noRejectReason: 'No reason was provided. Check the text, photo, and contact details or submit it again.',
    defaultRejectReason: 'the content does not meet Chaika Life publication rules',
  },
} as const;

export const getErrorTitle = (language: AppLanguage = 'ua') => MESSAGES[language].title;

const isPermissionLikeError = (raw: string): boolean =>
  raw.includes('permission-denied') ||
  raw.includes('permission_denied') ||
  raw.includes('permission denied') ||
  raw.includes('missing or insufficient permissions') ||
  raw.includes('unauthorized') ||
  raw.includes('forbidden');

const isExplicitAccessBlock = (raw: string): boolean =>
  raw.includes('blocked device') ||
  raw.includes('device_blocked') ||
  raw.includes('blocked_access_attempt') ||
  raw.includes('security violation') ||
  raw.includes('security_violation') ||
  raw.includes('yellow_list') ||
  raw.includes('banned') ||
  raw.includes('service_moderation') ||
  raw.includes('account blocked') ||
  raw.includes('profile blocked') ||
  raw.includes('access blocked');

const isRetryableActionContext = (context: UserErrorContext): boolean =>
  context === 'load' ||
  context === 'save' ||
  context === 'send' ||
  context === 'delete' ||
  context === 'moderation';

export const getUserErrorMessage = (
  language: AppLanguage = 'ua',
  context: UserErrorContext = 'unknown',
  rawError?: unknown,
): string => {
  const raw = String(
    typeof rawError === 'object' && rawError !== null && 'message' in rawError
      ? (rawError as { message?: unknown }).message
      : rawError ?? '',
  ).toLowerCase();

  if (raw.includes('auth/network-request-failed') || raw.includes('network') || raw.includes('offline') || raw.includes('fetch') || raw.includes('internet')) {
    return MESSAGES[language].network;
  }
  if (raw.includes('unavailable')) {
    return MESSAGES[language].unavailable;
  }
  if (raw.includes('unauthenticated')) {
    return MESSAGES[language].unauthenticated;
  }
  if (raw.includes('not-found')) {
    return MESSAGES[language].notFound;
  }
  if (raw.includes('authentication required') || raw.includes('not authenticated') || raw.includes('login required') || raw.includes('sign in')) {
    return MESSAGES[language].loginRequired;
  }
  if (raw.includes('rate limit') || raw.includes('too many requests') || raw.includes('too-many-requests') || raw.includes('rate_limits')) {
    return MESSAGES[language].cooldownActive;
  }
  if (raw.includes('missing required fields') || raw.includes('required fields') || raw.includes('obligatory fields')) {
    return MESSAGES[language].missingRequiredFields;
  }
  if (isPermissionLikeError(raw)) {
    if (context === 'upload') {
      return MESSAGES[language].upload;
    }
    if (isExplicitAccessBlock(raw)) {
      return MESSAGES[language].permissionDenied;
    }
    if (context === 'auth') {
      return MESSAGES[language].loginRequired;
    }
    if (isRetryableActionContext(context)) {
      return MESSAGES[language][context];
    }
    return MESSAGES[language].noPermission;
  }
  if (context === 'upload' && (raw.includes('upload') || raw.includes('storage') || raw.includes('blob'))) {
    return MESSAGES[language].uploadFailed;
  }
  if (raw.includes('invalid-price') || (raw.includes('price') && raw.includes('0.01'))) {
    return MESSAGES[language].invalidPrice;
  }
  if (raw.includes('image safety') || raw.includes('safety check failed') || raw.includes('blocked by safety')) {
    return MESSAGES[language].imageBlocked;
  }
  if (raw.includes('unsupported') || raw.includes('непідтримуваний') || raw.includes('неподдерживаем')) {
    return MESSAGES[language].unsupportedFile;
  }
  if (raw.includes('moderation') || raw.includes('censored') || raw.includes('blocked')) {
    return MESSAGES[language].moderationBlocked;
  }
  if (raw.includes('auth')) {
    return MESSAGES[language].auth;
  }
  if (raw.includes('validation') || raw.includes('invalid') || raw.includes('required')) {
    return MESSAGES[language].validation;
  }

  return MESSAGES[language][context];
};

export const showUserError = (
  language: AppLanguage = 'ua',
  context: UserErrorContext = 'unknown',
  rawError?: unknown,
): void => {
  Alert.alert(getErrorTitle(language), getUserErrorMessage(language, context, rawError));
};

export type InviteFieldError = {
  field: 'sponsorPhone' | 'text' | null;
  message: string;
  retryAfterSeconds?: number;
};

export const readUserFacingErrorCode = (error: unknown): string => {
  if (!error || typeof error !== 'object') return '';
  const record = error as Record<string, unknown>;
  return String(record.code || record.name || '').toLowerCase();
};

export const readUserFacingErrorDetails = (error: unknown): Record<string, unknown> => {
  if (!error || typeof error !== 'object') return {};
  const record = error as Record<string, unknown>;
  const direct = record.details;
  if (direct && typeof direct === 'object') return direct as Record<string, unknown>;
  const custom = record.customData || record._customData;
  if (custom && typeof custom === 'object') {
    const customRecord = custom as Record<string, unknown>;
    if (customRecord.details && typeof customRecord.details === 'object') {
      return customRecord.details as Record<string, unknown>;
    }
    return customRecord;
  }
  return {};
};

export const formatRetryAfter = (seconds?: number): string => {
  const value = Math.max(0, Math.ceil(Number(seconds || 0)));
  if (!Number.isFinite(value) || value <= 0) return 'Спробуйте повторити трохи пізніше.';
  const minutes = Math.max(1, Math.ceil(value / 60));
  if (minutes < 60) return `Следующая заявка возможна через ${minutes} мин.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `Следующая заявка возможна через ${hours} ч${rest ? ` ${rest} мин` : ''}.`;
};

export const formatCountdown = (seconds?: number): string => {
  const value = Math.max(0, Math.ceil(Number(seconds || 0)));
  const minutes = Math.floor(value / 60);
  const restSeconds = value % 60;
  return `${minutes}:${String(restSeconds).padStart(2, '0')}`;
};

export const getRateLimitRetryAfterSeconds = (error: unknown): number | undefined => {
  const code = readUserFacingErrorCode(error);
  const details = readUserFacingErrorDetails(error);
  const retryAfterSeconds = Number(details.retryAfterSeconds || details.retry_after_seconds || 0);
  if (!code.includes('resource-exhausted') && !String(details.error || details.code || '').includes('rate_limit')) {
    return undefined;
  }
  return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? Math.ceil(retryAfterSeconds) : undefined;
};

export const mapInviteCFErrorToField = (error: unknown): InviteFieldError => {
  const code = readUserFacingErrorCode(error);
  const details = readUserFacingErrorDetails(error);
  const field = String(details.field || '').toLowerCase();
  const reason = String(details.reason || details.code || '').toLowerCase();
  const retryAfterSeconds = Number(details.retryAfterSeconds || details.retry_after_seconds || 0);

  if (code.includes('resource-exhausted')) {
    return {
      field: null,
      message: formatRetryAfter(retryAfterSeconds),
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : undefined,
    };
  }

  if (code.includes('not-found') && reason === 'sponsor_not_found') {
    return { field: 'sponsorPhone', message: 'Поручитель не найден. Проверьте номер.' };
  }

  if (code.includes('invalid-argument') && (field === 'sponsor_phone' || field === 'sponsorphone')) {
    return { field: 'sponsorPhone', message: 'Телефон поручителя должен быть в формате +380XXXXXXXXX.' };
  }

  if (code.includes('invalid-argument') && field === 'text') {
    return { field: 'text', message: 'Напишите причину от 20 до 280 символов.' };
  }

  return { field: null, message: getUserErrorMessage('ru', 'send', error) };
};

export const getModerationUserMessage = (
  language: AppLanguage = 'ua',
  status?: string,
  reason?: string | null,
): string => {
  if (status === 'approved') return MESSAGES[language].approved;
  if (status === 'rejected') {
    const cleanReason = typeof reason === 'string' ? reason.trim() : '';
    const localizedReason = cleanReason === 'default_rejected' ? MESSAGES[language].defaultRejectReason : cleanReason;
    return cleanReason
      ? MESSAGES[language].rejectedWithReason(localizedReason)
      : `${MESSAGES[language].rejected} ${MESSAGES[language].noRejectReason}`;
  }
  return MESSAGES[language].pending;
};
