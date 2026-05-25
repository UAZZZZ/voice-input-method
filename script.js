let recognition = null;
let isRecording = false;
let isPaused = false;

const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const textArea = document.getElementById('textOutput');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const statusMsg = document.getElementById('statusMsg');
const interimDiv = document.getElementById('interimResult');

function showStatus(msg, isError = false) {
    statusMsg.innerHTML = msg;
    if (isError) {
        setTimeout(() => {
            if (!isRecording && !isPaused) statusMsg.innerHTML = '就绪，点击“开始录音”';
        }, 3000);
    }
}

function updateInterim(text) {
    if (text) {
        interimDiv.innerHTML = `🎤 实时: ${text}`;
    } else {
        interimDiv.innerHTML = '';
    }
}

function appendText(newText) {
    if (!newText) return;
    const old = textArea.value;
    textArea.value = old + (old ? '' : '') + newText;
    textArea.scrollTop = textArea.scrollHeight;
}

// ---------- 语音识别核心 ----------
function initRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showStatus('❌ 您的浏览器不支持语音识别，请使用Chrome/Edge', true);
        return null;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recog = new SpeechRecognition();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'zh-CN';
    
    recog.onstart = () => {
        isRecording = true;
        isPaused = false;
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        showStatus('🎙️ 录音中... 正在识别');
        updateInterim('');
    };
    
    recog.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }
        if (interimTranscript) updateInterim(interimTranscript);
        if (finalTranscript) {
            updateInterim('');
            if (handleMacro(finalTranscript)) return;
            let processed = applyAllDicts(finalTranscript);
            appendText(processed);
            showStatus(`✅ 已识别: ${processed.substring(0, 40)}...`);
        }
    };
    
    recog.onerror = (event) => {
        console.error('识别错误:', event.error);
        let msg = '';
        if (event.error === 'no-speech') msg = '未检测到语音';
        else if (event.error === 'audio-capture') msg = '未获取麦克风权限';
        else if (event.error === 'not-allowed') msg = '麦克风权限被拒绝';
        else msg = `错误: ${event.error}`;
        showStatus(`❌ ${msg}`, true);
        stopRecording();
    };
    
    recog.onend = () => {
        if (isRecording && !isPaused) {
            isRecording = false;
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = false;
            showStatus('录音已停止，可点击“开始”继续追加');
        } else if (isPaused) {
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = false;
        } else {
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = true;
            if (!statusMsg.innerHTML.includes('错误')) {
                showStatus('录音已结束，可重新开始');
            }
        }
        isRecording = false;
        updateInterim('');
    };
    return recog;
}

function startRecording() {
    if (!recognition) {
        recognition = initRecognition();
        if (!recognition) return;
    }
    if (isRecording) { showStatus('已经在录音中'); return; }
    try {
        recognition.start();
    } catch(e) {
        recognition = initRecognition();
        try { recognition.start(); } catch(err) { console.error(err); }
    }
}

function pauseRecording() {
    if (recognition && isRecording && !isPaused) {
        isPaused = true;
        isRecording = false;
        recognition.stop();
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = false;
        pauseBtn.textContent = '⏸️ 暂停';
        showStatus('⏸️ 已暂停，点击“开始”可继续追加');
    }
}

function stopRecording() {
    if (recognition) {
        isRecording = false;
        isPaused = false;
        try { recognition.stop(); } catch(e) {}
    }
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    pauseBtn.textContent = '⏸️ 暂停';
    showStatus('录音已结束');
}

startBtn.addEventListener('click', startRecording);
pauseBtn.addEventListener('click', pauseRecording);
stopBtn.addEventListener('click', stopRecording);
clearBtn.addEventListener('click', () => {
    textArea.value = '';
    showStatus('已清空内容');
});
copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(textArea.value);
        showStatus('📋 已复制到剪贴板');
    } catch(err) {
        showStatus('复制失败，请手动选择', true);
    }
});

// ---------- 专业词库 ----------
const builtInDicts = {
    medical: {
        '阿司匹林': '阿司匹林', 'aspirin': '阿司匹林',
        '高血压': '高血压', 'htn': '高血压',
        '糖尿病': '糖尿病', 'dm': '糖尿病',
        '心电图': '心电图', 'ecg': '心电图',
        '冠心病': '冠心病', 'chd': '冠心病'
    },
    legal: {
        '原告': '原告', '被告': '被告', '侵权': '侵权',
        '合同法': '合同法', '知识产权': '知识产权'
    },
    programming: {
        'function': '函数', 'for loop': 'for循环',
        'array': '数组', 'object': '对象', 'class': '类'
    }
};

let customDict = {};
function saveCustomDict() { localStorage.setItem('customDict', JSON.stringify(customDict)); }
function loadCustomDict() {
    const saved = localStorage.getItem('customDict');
    if (saved) { try { customDict = JSON.parse(saved); } catch(e) { customDict = {}; } }
}
loadCustomDict();

function applyCustomDict(text) {
    let result = text;
    for (let [abbr, full] of Object.entries(customDict)) {
        const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
        result = result.replace(regex, full);
    }
    return result;
}
function applyBuiltInDict(text, domain) {
    if (domain === 'general') return text;
    const dict = builtInDicts[domain] || {};
    let result = text;
    for (let [key, value] of Object.entries(dict)) {
        const regex = new RegExp(`\\b${key}\\b`, 'gi');
        result = result.replace(regex, value);
    }
    return result;
}
function applyAllDicts(text) {
    let step1 = applyCustomDict(text);
    let step2 = applyBuiltInDict(step1, currentDomain);
    return step2;
}

let currentDomain = 'general';
const domainSelect = document.getElementById('domainSelect');
domainSelect.addEventListener('change', (e) => {
    currentDomain = e.target.value;
    showStatus(`已切换到 ${domainSelect.options[domainSelect.selectedIndex].text} 模式`);
});

// 自定义词库 UI
function refreshCustomDictUI() {
    const list = document.getElementById('customDictList');
    if (!list) return;
    list.innerHTML = '';
    for (let [abbr, full] of Object.entries(customDict)) {
        const li = document.createElement('li');
        li.textContent = `${abbr} → ${full}`;
        li.onclick = () => {
            document.getElementById('dictAbbr').value = abbr;
            document.getElementById('dictFull').value = full;
        };
        list.appendChild(li);
    }
}
document.getElementById('addDictBtn')?.addEventListener('click', () => {
    const abbr = document.getElementById('dictAbbr').value.trim();
    const full = document.getElementById('dictFull').value.trim();
    if (abbr && full) {
        customDict[abbr] = full;
        saveCustomDict();
        refreshCustomDictUI();
        showStatus(`词条 ${abbr} → ${full} 已保存`);
        document.getElementById('dictAbbr').value = '';
        document.getElementById('dictFull').value = '';
    } else { showStatus('请填写缩写和术语', true); }
});
document.getElementById('deleteDictBtn')?.addEventListener('click', () => {
    const abbr = document.getElementById('dictAbbr').value.trim();
    if (abbr && customDict[abbr]) {
        delete customDict[abbr];
        saveCustomDict();
        refreshCustomDictUI();
        showStatus(`词条 ${abbr} 已删除`);
        document.getElementById('dictAbbr').value = '';
        document.getElementById('dictFull').value = '';
    } else { showStatus('请填写要删除的缩写', true); }
});
refreshCustomDictUI();

// ---------- 语音宏（重点修复）----------
let macros = {
    '问候语': '您好，我是七牛云实训营的选手，很高兴参加这次实训。',
    '签名': '—— 来自语音输入法（专业词库+宏版）',
    '代码模板': 'function main() {\n    \n}',
    '病历模板': '主诉：头痛3天。既往史：高血压病史。'
};

function cleanMacroName(name) {
    return name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]/g, '');
}

function saveMacros() {
    localStorage.setItem('voiceMacros', JSON.stringify(macros));
    console.log('宏已保存', macros);
}

function loadMacros() {
    const saved = localStorage.getItem('voiceMacros');
    if (saved) {
        try {
            macros = JSON.parse(saved);
            console.log('宏已加载', macros);
        } catch(e) { console.error(e); }
    }
}
loadMacros();

function refreshMacroListUI() {
    const container = document.getElementById('macroList');
    if (!container) {
        console.error('找不到 macroList 元素');
        return;
    }
    container.innerHTML = '';
    for (let name in macros) {
        const li = document.createElement('li');
        li.textContent = `${name} → ${macros[name].substring(0, 30)}...`;
        li.onclick = () => {
            document.getElementById('macroName').value = name;
            document.getElementById('macroContent').value = macros[name];
        };
        container.appendChild(li);
    }
    console.log('宏列表已刷新，共', Object.keys(macros).length, '条');
}

function handleMacro(text) {
    const match = text.match(/^(宏|插入宏|运行宏|使用宏|调用宏)\s*(.+)$/);
    if (match) {
        let rawName = match[2].trim();
        let macroName = cleanMacroName(rawName);
        console.log(`宏指令: "${rawName}" -> 清理后 "${macroName}"`);
        if (macros[macroName]) {
            appendText(macros[macroName]);
            showStatus(`✅ 已插入宏“${macroName}”`);
        } else {
            showStatus(`❌ 未找到宏“${macroName}”，请先添加`, true);
        }
        return true;
    }
    return false;
}

// 添加宏按钮
const addMacroBtn = document.getElementById('addMacroBtn');
if (addMacroBtn) {
    addMacroBtn.addEventListener('click', () => {
        let rawName = document.getElementById('macroName').value.trim();
        const content = document.getElementById('macroContent').value;
        if (rawName && content) {
            const cleanName = cleanMacroName(rawName);
            if (!cleanName) { showStatus('宏名称无效', true); return; }
            macros[cleanName] = content;
            saveMacros();
            refreshMacroListUI();
            showStatus(`宏“${cleanName}”已保存`);
            document.getElementById('macroName').value = '';
            document.getElementById('macroContent').value = '';
        } else {
            showStatus('请填写宏名称和内容', true);
        }
    });
} else console.error('找不到 addMacroBtn');

// 删除宏按钮
const deleteMacroBtn = document.getElementById('deleteMacroBtn');
if (deleteMacroBtn) {
    deleteMacroBtn.addEventListener('click', () => {
        let rawName = document.getElementById('macroName').value.trim();
        if (rawName) {
            const cleanName = cleanMacroName(rawName);
            if (macros[cleanName]) {
                delete macros[cleanName];
                saveMacros();
                refreshMacroListUI();
                showStatus(`宏“${cleanName}”已删除`);
                document.getElementById('macroName').value = '';
                document.getElementById('macroContent').value = '';
            } else {
                showStatus(`未找到宏“${cleanName}”`, true);
            }
        } else {
            showStatus('请填写要删除的宏名称', true);
        }
    });
} else console.error('找不到 deleteMacroBtn');

// 导入导出
function exportData() {
    const exportObj = { macros, customDict, version: '1.0' };
    const dataStr = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voice_input_export.json';
    a.click();
    URL.revokeObjectURL(url);
    showStatus('导出成功');
}
function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.macros) { macros = data.macros; saveMacros(); refreshMacroListUI(); }
            if (data.customDict) { customDict = data.customDict; saveCustomDict(); refreshCustomDictUI(); }
            showStatus('导入成功');
        } catch(err) { showStatus('导入失败：JSON格式错误', true); }
    };
    reader.readAsText(file);
}
document.getElementById('exportDataBtn')?.addEventListener('click', exportData);
const importFileInput = document.getElementById('importFileInput');
document.querySelector('.import-label')?.addEventListener('click', () => importFileInput.click());
importFileInput?.addEventListener('change', (e) => {
    if (e.target.files.length) { importData(e.target.files[0]); e.target.value = ''; }
});

// 页面加载完成后刷新列表
window.addEventListener('DOMContentLoaded', () => {
    refreshMacroListUI();
    refreshCustomDictUI();
    recognition = initRecognition();
});