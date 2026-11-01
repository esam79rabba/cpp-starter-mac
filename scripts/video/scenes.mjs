// Each scene: say = what Majed speaks (English words spelled in Arabic so the voice reads them),
// caption = Arabic subtitle shown on screen, step = badge text, body = the visual (HTML).

const win = (title, inner, extra = '') => `
<div class="win ${extra}">
  <div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="wtitle">${title}</span></div>
  ${inner}
</div>`;

const code = (lines, opts = {}) => `
<div class="code">${lines
  .map((l, i) => {
    const n = i + 1;
    const cls = [opts.bp === n ? 'bpline' : '', opts.stop === n ? 'stopline' : ''].join(' ');
    const gutter = opts.bp === n ? '<span class="bp"></span>' : '<span class="nobp"></span>';
    return `<div class="ln ${cls}">${gutter}<span class="num">${n}</span><span class="src">${l}</span></div>`;
  })
  .join('')}</div>`;

const HELLO = [
  '<span class="kw">#include</span> <span class="str">&lt;iostream&gt;</span>',
  '',
  '<span class="ty">int</span> <span class="fn">main</span>()',
  '{',
  '    std::cout &lt;&lt; <span class="str">"Hello World!\\n"</span>;',
  '}',
];

const editor = (inner, side = '') => `
<div class="vscode">
  <div class="activity"><i></i><i></i><i class="on"></i><i></i></div>
  ${side}
  <div class="main">${inner}</div>
</div>
<div class="status"><span>main.cpp</span><span class="sb">▶ Run</span><span class="sb">⚒ Build</span></div>`;

const keys = (...k) => `<div class="keys">${k.map((x) => (x === '+' ? '<b>+</b>' : `<kbd>${x}</kbd>`)).join('')}</div>`;

export const scenes = [
  {
    say: 'أهلاً بك. في هذا الفيديو ستتعلم كيف تثبّت إضافة {C++ Starter for Mac}، وتشغّل أول برنامج لك بضغطة زر واحدة.',
    caption: 'تعلّم تثبيت إضافة C++ Starter for Mac وتشغيل أول برنامج لك بضغطة زر',
    body: `<div class="hero"><img src="ICON"><h1>C++ Starter for Mac</h1><p>شغّل C++ على الماك… تماماً مثل Visual Studio</p></div>`,
  },
  {
    say: 'الدكتور يشرح على {Visual Studio} في الويندوز. وهذه الإضافة تعطيك نفس التجربة على الماك، مجاناً.',
    caption: 'الدكتور يشرح على Visual Studio في الويندوز… وهذه الإضافة تعطيك نفس التجربة على الماك، مجاناً',
    body: `<div class="vs">
      <div class="card"><div class="os">Windows</div><div class="big">Visual Studio</div>${keys('F5')}<div class="ok">✓</div></div>
      <div class="eq">=</div>
      <div class="card mac"><div class="os">macOS</div><div class="big">VS Code + C++ Starter</div>${keys('fn', '+', 'F5')}<div class="ok">✓</div></div>
    </div>`,
  },
  {
    step: 'الخطوة ١',
    say: 'الخطوة الأولى: حمّل برنامج {VS Code} من الموقع الرسمي، ثم انقله إلى مجلد التطبيقات.',
    caption: 'حمّل VS Code من code.visualstudio.com وانقله إلى مجلد Applications',
    body: win('code.visualstudio.com', `<div class="site"><div class="url">🔒 code.visualstudio.com</div>
      <h2>Visual Studio Code</h2><p>Free. Built on open source. Runs everywhere.</p>
      <div class="dl pulse">⬇ Download for macOS</div></div>`, 'browser'),
  },
  {
    step: 'الخطوة ٢',
    say: 'الخطوة الثانية: افتح قائمة الإضافات بالضغط على {Command, Shift, X.} ابحث عن {C++ Starter for Mac,} ثم اضغط {Install.}',
    caption: 'افتح الإضافات (Cmd + Shift + X)، ابحث عن C++ Starter for Mac واضغط Install',
    body: win('Visual Studio Code', editor(`<div class="empty">${keys('⌘ Cmd', '+', '⇧ Shift', '+', 'X')}</div>`, `
      <div class="side"><div class="stitle">EXTENSIONS</div><div class="search">C++ Starter for Mac</div>
      <div class="ext"><img src="ICON"><div><b>C++ Starter for Mac</b><span>Esam Rabba</span><small>Build, run and debug C++ on a Mac like in Visual Studio</small></div><div class="inst pulse">Install</div></div></div>`)),
  },
  {
    step: 'الخطوة ٢',
    say: 'إذا لم تكن أدوات أبل مثبتة على جهازك، ستظهر لك هذه الرسالة. اضغط {Install,} وانتظر حتى ينتهي برنامج التثبيت من أبل.',
    caption: 'إذا ظهرت رسالة "C++ tools are not installed" اضغط Install وانتظر انتهاء تثبيت أبل',
    body: win('Visual Studio Code', editor('<div class="empty dim">C++</div>') + `
      <div class="toast"><span class="ic">ℹ</span>C++ tools are not installed. Install now?<div class="tbtn pulse">Install</div></div>`),
  },
  {
    step: 'الخطوة ٢',
    say: 'وعندما تظهر رسالة {Ready to build C++,} يعني أن كل شيء جاهز.',
    caption: 'رسالة "Ready to build C++" تعني أن كل شيء جاهز ✓',
    body: win('Visual Studio Code', editor('<div class="empty dim">C++</div>') + `
      <div class="toast good"><span class="ic">✓</span>Ready to build C++</div>`),
  },
  {
    step: 'الخطوة ٣',
    say: 'الخطوة الثالثة: من صفحة البداية، اختر {Create a new project.}',
    caption: 'من صفحة Get started اختر Create a new project',
    body: win('Get started', editor(`<div class="start"><h1>Get started</h1>
      <div class="sbtn primary pulse">Create a new project</div><div class="sbtn">Open a local folder</div><div class="sbtn">Open a project or solution</div></div>`)),
  },
  {
    step: 'الخطوة ٣',
    say: 'اكتب اسم المشروع، واختر مكان الحفظ. ستحصل على مجلد فيه ملف {main dot C P P,} جاهز للتشغيل.',
    caption: 'اكتب اسم المشروع واختر مكان الحفظ — ستحصل على ملف main.cpp جاهز',
    body: win('Visual Studio Code', editor('<div class="empty dim">C++</div>') + `
      <div class="quick"><div class="qtitle">Project name</div><div class="qin">Lab1<span class="caret"></span></div><div class="qhint">Press 'Enter' to confirm</div></div>`),
  },
  {
    step: 'الخطوة ٤',
    say: 'الخطوة الرابعة: اضغط بجانب رقم السطر لتضع نقطة توقف حمراء، ثم اضغط {F N, plus F5.}',
    caption: 'اضغط بجانب رقم السطر لوضع نقطة توقف 🔴 ثم اضغط fn + F5',
    body: win('main.cpp — Lab1', editor(`<div class="tab">main.cpp</div>${code(HELLO, { bp: 5 })}${keys('fn', '+', 'F5')}`)),
  },
  {
    step: 'الخطوة ٤',
    say: 'سيتوقف البرنامج عند السطر الذي اخترته. اضغط {F10} للانتقال سطراً سطراً. واضغط {F11} للدخول إلى الدالة. وللإيقاف اضغط {Shift, F5.}',
    caption: 'البرنامج يتوقف عند نقطة التوقف — F10 سطر بسطر، F11 دخول للدالة، Shift + F5 إيقاف',
    body: win('main.cpp — Lab1', editor(`<div class="dbgbar">⏸ ⤼ ⤓ ⤒ ↻ ⏹</div><div class="tab">main.cpp</div>${code(HELLO, { bp: 5, stop: 5 })}
      <div class="keyrow">${keys('F10')}<span>سطر بسطر</span>${keys('F11')}<span>دخول للدالة</span>${keys('⇧ Shift', '+', 'F5')}<span>إيقاف</span></div>`,
      `<div class="side"><div class="stitle">VARIABLES</div><div class="var">▾ Locals</div><div class="stitle">CALL STACK</div><div class="var">main() &nbsp; main.cpp:5</div></div>`)),
  },
  {
    step: 'الخطوة ٥',
    say: 'وللتشغيل بدون {debugger,} اضغط {Control, F N, F5.} يظهر الناتج، ثم رسالة {Press any key to close this window,} تماماً مثل {Visual Studio.}',
    caption: 'للتشغيل بدون Debugger اضغط Ctrl + fn + F5 — تماماً مثل Visual Studio',
    body: win('main.cpp — Lab1', editor(`<div class="tab">main.cpp</div>${code(HELLO)}
      <div class="term"><div class="ttabs"><span>PROBLEMS</span><span>OUTPUT</span><span class="on">TERMINAL</span></div>
      <pre>Hello World!

Press any key to close this window . . .</pre></div>${keys('Ctrl', '+', 'fn', '+', 'F5')}`)),
  },
  {
    say: 'وإذا كان في الكود خطأ، سيظهر في تبويب {Problems,} مع شرح مبسّط يساعدك على إصلاحه.',
    caption: 'الأخطاء تظهر في تبويب Problems مع شرح مبسّط لطريقة الإصلاح',
    body: win('main.cpp — Lab1', editor(`<div class="tab">main.cpp</div>${code([
      '<span class="kw">#include</span> <span class="str">&lt;iostream&gt;</span>', '', '<span class="ty">int</span> <span class="fn">main</span>()', '{',
      '    std::cout &lt;&lt; <span class="str">"Hello World!\\n"</span><span class="squig"> </span>', '}'])}
      <div class="term"><div class="ttabs"><span class="on">PROBLEMS <em>1</em></span><span>TERMINAL</span></div>
      <div class="prob"><span class="err">⊗</span> expected ';' after expression <small>main.cpp [5]</small></div>
      <div class="prob expl">💡 A semicolon (;) is missing at the end of the previous statement.</div></div>`)),
  },
  {
    say: 'وكود الدكتور يعمل كما هو بدون تعديل. مثل: {system pause. conio. scanf underscore S.} وحتى ملفات المشاريع {dot S L N.}',
    caption: 'كود الدكتور يعمل بدون تعديل',
    body: `<div class="chips"><code>system("pause")</code><code>#include &lt;conio.h&gt;</code><code>scanf_s</code><code>#include "pch.h"</code><code>Project.sln</code></div>`,
  },
  {
    say: 'ابحث عن {C++ Starter for Mac} في {VS Code,} وشارك الإضافة مع زملائك. بالتوفيق!',
    caption: 'ابحث عن C++ Starter for Mac في VS Code وشاركها مع زملائك 💜',
    body: `<div class="hero"><img src="ICON"><h1>C++ Starter for Mac</h1><p>مجانية ومفتوحة المصدر</p>
      <div class="link">marketplace.visualstudio.com → EsamRabba.cpp-starter-mac</div></div>`,
  },
];
