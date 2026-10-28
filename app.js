
const DB = "NovelReader";
let db;
let S = { v: "books" };
let timer;
let lastSwipeAt = 0;

const $ = q => document.querySelector(q);
const app = $("#app");

const uid = () =>
    crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + "" + Math.random();

const rq = r => new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
});

const st = (name, mode = "readonly") =>
    db.transaction(name, mode).objectStore(name);

const all = name => rq(st(name).getAll());
const get = (name, key) => rq(st(name).get(key));
const put = (name, value) =>
    rq(st(name, "readwrite").put(value));
const del = (name, key) =>
    rq(st(name, "readwrite").delete(key));
const ix = (name, index, key) =>
    rq(st(name).index(index).getAll(key));

const esc = s => (s || "").replace(
    /[&<>"']/g,
    c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c])
);

// データベース
function openDB() {
    return new Promise((resolve, reject) => {
        const r = indexedDB.open(DB, 1);

        r.onupgradeneeded = () => {
            const d = r.result;

            if (!d.objectStoreNames.contains("books")) {
                d.createObjectStore("books", {
                    keyPath: "id"
                });
            }

            if (!d.objectStoreNames.contains("volumes")) {
                const x = d.createObjectStore("volumes", {
                    keyPath: "id"
                });
                x.createIndex("book", "book");
            }

            if (!d.objectStoreNames.contains("chapters")) {
                const x = d.createObjectStore("chapters", {
                    keyPath: "id"
                });
                x.createIndex("volume", "volume");
            }
        };

        r.onsuccess = () => {
            db = r.result;
            resolve();
        };

        r.onerror = () => reject(r.error);
    });
}

// ヘッダー
function head(title, subtitle = "") {
    $("#title").textContent = title;
    $("#sub").textContent = subtitle;

    $("#back").classList.toggle(
        "hide",
        S.v === "books"
    );

    $("#fab").classList.toggle(
        "hide",
        ["reader", "form"].includes(S.v)
    );

    $("#readerNav").classList.toggle(
        "hide",
        S.v !== "reader"
    );
}

// 画面切り替え
async function render() {
    document.body.classList.toggle(
        "horizontal-reader",
        S.v === "reader"
    );

    if (S.v === "books") return books();
    if (S.v === "volumes") return volumes();
    if (S.v === "chapters") return chapters();
    if (S.v === "reader") return reader();
}

// 本棚
async function books() {
    head("📚 本棚", "端末内に保存");

    const a = await all("books");

    app.innerHTML = a.map(x => `
        <div class="card" onclick="openBook('${x.id}')">
            <h2>📖 ${esc(x.title)}</h2>
        </div>
    `).join("") ||
    "<div class='card'>右下の＋から本を追加できます。</div>";

    app.innerHTML += `
        <div class="card">
            <div class="row">
                <button class="secondary" onclick="backup()">
                    📤 バックアップ
                </button>
                <button class="secondary" onclick="$('#restore').click()">
                    📥 復元
                </button>
            </div>
        </div>
    `;
}

window.openBook = i => {
    S = { v: "volumes", book: i };
    render();
};

// 巻一覧
async function volumes() {
    const b = await get("books", S.book);
    const a = await ix("volumes", "book", S.book);

    head("📚 " + b.title, "巻を選択");

    app.innerHTML = a.map(x => `
        <div class="card" onclick="openVolume('${x.id}')">
            <h2>📕 ${esc(x.title)}</h2>
        </div>
    `).join("") ||
    "<div class='card'>まだ巻がありません。</div>";

    app.innerHTML += `
        <div class="card">
            <div class="row">
                <button onclick="addVolume()">＋ 巻追加</button>
                <button class="danger" onclick="deleteBook()">
                    本を削除
                </button>
            </div>
        </div>
    `;
}

window.openVolume = i => {
    S.v = "chapters";
    S.volume = i;
    render();
};

// 章一覧
async function chapters() {
    const v = await get("volumes", S.volume);

    const a = (
        await ix("chapters", "volume", S.volume)
    ).sort((x, y) => x.created - y.created);

    head("📕 " + v.title, "章を選択");

    app.innerHTML = a.map(x => `
        <div class="card">
            <div onclick="openChapter('${x.id}')">
                <h3>📄 ${esc(x.title)}</h3>
                <span class="muted">
                    ${x.text.length.toLocaleString()}文字
                </span>
            </div>
            <div class="row" style="margin-top:10px">
                <button class="secondary"
                    onclick="editChapter('${x.id}')">
                    ✏️ 編集
                </button>
                <button class="danger"
                    onclick="deleteChapter('${x.id}')">
                    🗑️ 削除
                </button>
            </div>
        </div>
    `).join("") ||
    "<div class='card'>まだ章がありません。</div>";

    app.innerHTML += `
        <div class="card">
            <div class="row">
                <button onclick="chapterForm()">＋ 章追加</button>
                <button class="secondary" onclick="$('#txt').click()">
                    TXT読込
                </button>
            </div>
            <br>
            <button class="danger" onclick="deleteVolume()">
                この巻を削除
            </button>
        </div>
    `;
}

// 横ページの幅
function pageWidth() {
    const read = $("#read");
    return read ? read.clientWidth : 1;
}

// 現在のページ番号
function currentPage() {
    const read = $("#read");
    if (!read) return 0;

    return Math.round(read.scrollLeft / pageWidth());
}

// ページ移動
function turnPage(direction) {
    const read = $("#read");
    if (!read) return;

    const width = pageWidth();

    const maxPage = Math.max(
        0,
        Math.ceil((read.scrollWidth - width) / width)
    );

    const next = Math.max(
        0,
        Math.min(maxPage, currentPage() + direction)
    );

    read.scrollTo({
        left: next * width,
        behavior: "smooth"
    });
}

// 読書位置を保存
async function savePosition() {
    if (S.v !== "reader") return;

    const read = $("#read");
    const chapterId = S.chapter;

    if (!read || !chapterId) return;

    const position = read.scrollLeft;
    const c = await get("chapters", chapterId);

    if (!c) return;

    c.scrollX = position;
    await put("chapters", c);
}

// 自動保存予約
function scheduleSave() {
    clearTimeout(timer);

    timer = setTimeout(() => {
        savePosition();
    }, 300);
}

// 章を開く
window.openChapter = async i => {
    clearTimeout(timer);

    S.v = "reader";
    S.chapter = i;

    await render();

    const c = await get("chapters", i);
    const read = $("#read");

    if (!c || !read) return;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const width = pageWidth();

            const page = Math.round(
                (c.scrollX || 0) / width
            );

            read.scrollLeft = page * width;
        });
    });
};

// 読書画面
async function reader() {
    const c = await get("chapters", S.chapter);
    const v = await get("volumes", c.volume);

    head("📖 " + c.title, v.title);

    app.innerHTML = `
        <article id="read" class="reader">
            ${esc(c.text)}
        </article>
    `;

    const read = $("#read");

    read.style.fontSize =
        (localStorage.font || 18) + "px";

    // 横スクロール位置を自動保存
    read.addEventListener(
        "scroll",
        scheduleSave,
        { passive: true }
    );

    // スワイプ操作
    let startX = 0;
    let startY = 0;

    read.addEventListener("touchstart", e => {
        if (e.touches.length !== 1) return;

        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    read.addEventListener("touchend", e => {
        if (e.changedTouches.length !== 1) return;

        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;

        const dx = endX - startX;
        const dy = endY - startY;

        if (
            Math.abs(dx) > 45 &&
            Math.abs(dx) > Math.abs(dy) * 1.3
        ) {
            lastSwipeAt = Date.now();

            // 左スワイプ → 次のページ
            // 右スワイプ → 前のページ
            turnPage(dx < 0 ? 1 : -1);
        }
    }, { passive: true });
}

// 左右タップでページ送り
app.addEventListener("click", e => {
    if (S.v !== "reader") return;

    // スワイプ直後のクリックは無視
    if (Date.now() - lastSwipeAt < 500) return;

    // 文字選択中はページを動かさない
    if (window.getSelection()?.toString()) return;

    if (e.target.closest("a, button, input")) return;

    const x = e.clientX;
    const width = window.innerWidth;

    if (x > width * 0.65) {
        turnPage(1);
    } else if (x < width * 0.35) {
        turnPage(-1);
    }
});

// 本を追加
async function addBook() {
    const t = prompt("本のタイトル");

    if (t?.trim()) {
        await put("books", {
            id: uid(),
            title: t.trim()
        });
        render();
    }
}

// 巻を追加
async function addVolume() {
    const t = prompt("巻のタイトル");

    if (t?.trim()) {
        await put("volumes", {
            id: uid(),
            book: S.book,
            title: t.trim()
        });
        render();
    }
}

// 章の追加・編集
function chapterForm(x = null, text = "") {
    S.v = "form";
    document.body.classList.remove("horizontal-reader");

    head(
        x ? "✏️ 章を編集" : "＋ 章追加",
        "本文を貼り付け"
    );

    app.innerHTML = `
        <div class="card">
            <input id="ct" placeholder="章タイトル"
                value="${x ? esc(x.title) : ""}">
            <textarea id="body" placeholder="日本語本文">${
                esc(x ? x.text : text)
            }</textarea>
            <button id="save">保存</button>
        </div>
    `;

    $("#save").onclick = async () => {
        const t = $("#ct").value.trim();
        const b = $("#body").value;

        if (!t || !b.trim()) {
            alert("タイトルと本文を入力してください");
            return;
        }

        await put(
            "chapters",
            x
                ? { ...x, title: t, text: b }
                : {
                    id: uid(),
                    volume: S.volume,
                    title: t,
                    text: b,
                    created: Date.now(),
                    scroll: 0,
                    scrollX: 0
                }
        );

        S.v = "chapters";
        render();
    };
}

window.editChapter = async i => {
    chapterForm(await get("chapters", i));
};

window.deleteChapter = async i => {
    if (confirm("削除しますか？")) {
        await del("chapters", i);
        render();
    }
};

// 巻を削除
async function deleteVolume() {
    if (!confirm("巻と中の章を削除しますか？")) return;

    for (const c of await ix("chapters", "volume", S.volume)) {
        await del("chapters", c.id);
    }

    await del("volumes", S.volume);

    S.v = "volumes";
    delete S.volume;

    render();
}

// 本を削除
async function deleteBook() {
    if (!confirm("本・巻・章をすべて削除しますか？")) return;

    for (const v of await ix("volumes", "book", S.book)) {
        for (const c of await ix("chapters", "volume", v.id)) {
            await del("chapters", c.id);
        }

        await del("volumes", v.id);
    }

    await del("books", S.book);

    S = { v: "books" };
    render();
}

// ＋ボタン
$("#fab").onclick = () => {
    if (S.v === "books") {
        addBook();
    } else if (S.v === "volumes") {
        addVolume();
    } else {
        chapterForm();
    }
};

// 戻るボタン
$("#back").onclick = async () => {
    if (S.v === "reader") {
        clearTimeout(timer);
        await savePosition();
    }

    if (S.v === "volumes") {
        S = { v: "books" };
    } else if (S.v === "chapters") {
        S.v = "volumes";
        delete S.volume;
    } else {
        S.v = "chapters";
        delete S.chapter;
    }

    render();
};

// ダークモード
$("#theme").onclick = () => {
    document.body.classList.toggle("dark");

    localStorage.dark =
        document.body.classList.contains("dark")
            ? "1"
            : "0";
};

if (localStorage.dark === "1") {
    document.body.classList.add("dark");
}

// 文字サイズ
function font(d) {
    const read = $("#read");

    const oldPage = read ? currentPage() : 0;

    const n = Math.max(
        14,
        Math.min(
            30,
            Number(localStorage.font || 18) + d
        )
    );

    localStorage.font = n;

    if (read) {
        read.style.fontSize = n + "px";

        requestAnimationFrame(() => {
            read.scrollLeft = oldPage * pageWidth();
            scheduleSave();
        });
    }
}

$("#minus").onclick = () => font(-1);
$("#plus").onclick = () => font(1);

// 前章・次章
async function adj(d) {
    await savePosition();

    const c = await get("chapters", S.chapter);

    const a = (
        await ix("chapters", "volume", c.volume)
    ).sort((x, y) => x.created - y.created);

    const i = a.findIndex(x => x.id === c.id);

    if (a[i + d]) {
        openChapter(a[i + d].id);
    }
}

$("#prev").onclick = () => adj(-1);
$("#next").onclick = () => adj(1);

// TXT読み込み
$("#txt").onchange = async e => {
    const files = Array.from(e.target.files);

    if (!files.length) return;

    files.sort((a, b) =>
        a.name.localeCompare(
            b.name,
            "ja",
            { numeric: true }
        )
    );

    // 1ファイルなら編集画面へ
    if (files.length === 1) {
        const f = files[0];

        chapterForm(null, await f.text());

        $("#ct").value =
            f.name.replace(/\.txt$/i, "");

        e.target.value = "";
        return;
    }

    // 複数ファイルなら一括追加
    if (!confirm(
        `${files.length}章をまとめて追加しますか？`
    )) {
        e.target.value = "";
        return;
    }

    let count = 0;

    for (const f of files) {
        const text = await f.text();

        if (!text.trim()) continue;

        await put("chapters", {
            id: uid(),
            volume: S.volume,
            title: f.name.replace(/\.txt$/i, ""),
            text,
            created: Date.now() + count,
            scroll: 0,
            scrollX: 0,
            progress: 0
        });

        count++;
    }

    e.target.value = "";

    alert(`${count}章を追加しました！`);

    S.v = "chapters";
    render();
};

// バックアップ
async function backup() {
    const d = {
        books: await all("books"),
        volumes: await all("volumes"),
        chapters: await all("chapters")
    };

    const b = new Blob(
        [JSON.stringify(d)],
        { type: "application/json" }
    );

    const a = document.createElement("a");

    a.href = URL.createObjectURL(b);
    a.download = "novel-reader-backup.json";
    a.click();
}

// 復元
$("#restore").onchange = async e => {
    try {
        if (!e.target.files.length) return;

        const d = JSON.parse(
            await e.target.files[0].text()
        );

        if (!confirm("バックアップを追加しますか？")) {
            return;
        }

        for (const x of d.books) {
            await put("books", x);
        }

        for (const x of d.volumes) {
            await put("volumes", x);
        }

        for (const x of d.chapters) {
            await put("chapters", x);
        }

        render();
    } catch (err) {
        alert("読み込めませんでした");
    } finally {
        e.target.value = "";
    }
};

// 起動
openDB()
    .then(render)
    .catch(err => {
        console.error(err);
        alert("本棚を開けませんでした");
    });
