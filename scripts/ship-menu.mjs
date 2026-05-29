import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const valueOf = (name, fallback = '') => {
  const exact = args.indexOf(name);
  if (exact >= 0 && args[exact + 1] && !args[exact + 1].startsWith('--')) return args[exact + 1];
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
};

const run = (args) => {
  const commandArgs = ['run', 'ship', '--', ...args];
  const shellQuote = (value) => {
    const text = String(value);
    if (!/[\s"&()^|<>]/.test(text)) return text;
    return `"${text.replace(/"/g, '\\"')}"`;
  };
  const result = process.platform === 'win32' ? spawnSync(['npm', ...commandArgs].map(shellQuote).join(' '), {
    stdio: 'inherit',
    shell: true,
  }) : spawnSync('npm', commandArgs, { stdio: 'inherit' });
  return result.status ?? 1;
};

const printMenu = () => {
  console.log('');
  console.log('=============================================================');
  console.log('  ЧАЙКА: ПРОВЕРИТЬ + СОХРАНИТЬ КОМИТ + ДЕПЛОЙ НА СЕРВЕР');
  console.log('=============================================================');
  console.log('');
  console.log('Что делает этот запуск:');
  console.log('- запускает проверки, чтобы не сохранить сломанный код;');
  console.log('- делает git commit, чтобы изменения не потерялись;');
  console.log('- при выборе деплоя отправляет правила/функции Firebase на сервер;');
  console.log('- при выборе push отправляет коммит в git remote, если он настроен.');
  console.log('');
  console.log('ВАЖНО:');
  console.log('- если нужен реальный сервер Firebase, выбирай пункт 2 или 3;');
  console.log('- пункт 1 только сохраняет коммит локально, сервер НЕ меняет;');
  console.log('- пункт 4 ничего не меняет, только показывает что будет сделано.');
  console.log('');
  console.log('Выбери режим:');
  console.log('1. Только проверки + локальный коммит, БЕЗ деплоя на сервер');
  console.log('2. Проверки + коммит + деплой правил Firebase database/storage');
  console.log('3. Проверки + коммит + полный деплой Firebase rules/storage/functions + git push');
  console.log('4. Пробный запуск: ничего не менять, только показать действия');
  console.log('');
};

const askOptions = async () => {
  const argMode = valueOf('--mode');
  const argMessage = valueOf('--message');
  if (argMode) {
    printMenu();
    return {
      mode: argMode.trim(),
      message: argMessage.trim() || 'Ship project updates',
    };
  }

  const rl = readline.createInterface({ input, output });
  try {
    printMenu();
    const mode = (await rl.question('Введите номер [1-4]: ')).trim() || '1';
    console.log('');
    console.log('Сообщение коммита - это короткое описание изменений.');
    console.log('Пример: Исправить загрузку фото');
    console.log('');
    const message = (await rl.question('Введите сообщение коммита: ')).trim() || 'Ship project updates';
    return { mode, message };
  } finally {
    rl.close();
  }
};

const main = async () => {
const { mode, message } = await askOptions();

let shipArgs;
if (mode === '1') {
  console.log('\nРежим 1: проверки + коммит. Сервер Firebase НЕ изменится.');
  shipArgs = ['--message', message];
} else if (mode === '2') {
  console.log('\nРежим 2: проверки + коммит + деплой правил Firebase database/storage.');
  shipArgs = ['--message', message, '--deploy=rules'];
} else if (mode === '3') {
  console.log('\nРежим 3: проверки + коммит + полный деплой Firebase + git push.');
  shipArgs = ['--message', message, '--deploy', '--push'];
} else if (mode === '4') {
  console.log('\nРежим 4: пробный запуск. Ничего не будет изменено.');
  shipArgs = ['--dry-run', '--message', message];
} else {
  console.error(`\nНеизвестный режим: ${mode}`);
  process.exit(1);
}

const code = run(shipArgs);
console.log('');
if (code === 0) {
  console.log('ГОТОВО: процесс успешно завершён.');
} else {
  console.log(`ОШИБКА: процесс завершился с кодом ${code}.`);
  console.log('Посмотри сообщение выше - там указано, какая проверка или команда упала.');
}
process.exit(code);
};

main().catch((error) => {
  console.error(`\nОШИБКА: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
