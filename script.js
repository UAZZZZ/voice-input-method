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

function showStatus(msg, isError = false) {
    statusMsg.innerHTML = msg;
    if (isError) {
        setTimeout(() => {
            if (!isRecording && !isPaused) statusMsg.innerHTML = '就绪，点击“开始录音”';
        }, 3000);
    }
}

function appendText(newText) {
    if (!newText) return;
    const old = textArea.value;
    textArea.value = old + (old ? '' : '') + newText;
    textArea.scrollTop = textArea.scrollHeight;
}

function initRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showStatus('❌ 您的浏览器不支持语音识别，请使用Chrome/Edge', true);
        return null;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recog = new SpeechRecognition();
    recog.continuous = true;
    recog.interimResults = false;
    recog.lang = 'zh-CN';
    
    recog.onstart = () => {
        isRecording = true;
        isPaused = false;
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        showStatus('🎙️ 录音中... 正在识别');
    };
    
    recog.onresult = (event) => {
        if (isPaused) return;
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            }
        }
        if (finalTranscript) {
            if (handleMacro(finalTranscript)) {
                return;
            }
            let processed = applyDomainDict(finalTranscript);
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
        if (isRecording || isPaused) {
        }
        isRecording = false;
        isPaused = false;
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        pauseBtn.textContent = '⏸️ 暂停';
        if (!statusMsg.innerHTML.includes('错误')) {
            showStatus('录音已结束，可重新开始');
        }
    };
    return recog;
}

function startRecording() {
    if (!recognition) {
        recognition = initRecognition();
        if (!recognition) return;
    }
    try {
        recognition.start();
    } catch(e) {
        try { recognition.stop(); } catch(err) {}
        setTimeout(() => recognition.start(), 200);
    }
}

function pauseRecording() {
    if (recognition && isRecording && !isPaused) {
        recognition.stop();
        isRecording = false;
        isPaused = true;
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = false;
        pauseBtn.textContent = '▶️ 继续';
        showStatus('⏸️ 已暂停，点击“继续”可追加录音');
    } else if (isPaused) {
        recognition = initRecognition();
        if (!recognition) return;
        recognition.start();
        isPaused = false;
        isRecording = true;
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        pauseBtn.textContent = '⏸️ 暂停';
        showStatus('🎙️ 继续录音中...');
    }
}

function stopRecording() {
    if (recognition) {
        try {
            recognition.stop();
        } catch(e) {}
    }
    isRecording = false;
    isPaused = false;
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

const domainDicts = {
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
let currentDomain = 'general';

function applyDomainDict(text) {
    if (currentDomain === 'general') return text;
    const dict = domainDicts[currentDomain] || {};
    let result = text;
    for (let [key, value] of Object.entries(dict)) {
        const regex = new RegExp(`\\b${key}\\b`, 'gi');
        result = result.replace(regex, value);
    }
    return result;
}

const domainSelect = document.getElementById('domainSelect');
domainSelect.addEventListener('change', (e) => {
    currentDomain = e.target.value;
    showStatus(`已切换到 ${domainSelect.options[domainSelect.selectedIndex].text} 模式`);
});

let macros = {
    '问候语': '您好，我是七牛云实训营的选手，很高兴参加这次实训。',
    '签名': '—— 来自语音输入法（专业词库+宏版）',
    '代码模板': 'function main() {\n    \n}',
    '病历模板': '主诉：头痛3天。既往史：高血压病史。'
};

const savedMacros = localStorage.getItem('voiceMacros');
if (savedMacros) macros = JSON.parse(savedMacros);

function saveMacros() {
    localStorage.setItem('voiceMacros', JSON.stringify(macros));
}

function handleMacro(text) {
    const match = text.match(/^(宏|插入宏)\s*(.+)$/);
    if (match) {
        const macroName = match[2].trim();
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

function refreshMacroListUI() {
    const list = document.getElementById('macroList');
    if (!list) return;
    list.innerHTML = '';
    for (let name in macros) {
        const li = document.createElement('li');
        li.textContent = `${name} → ${macros[name].substring(0, 30)}...`;
        li.onclick = () => {
            document.getElementById('macroName').value = name;
            document.getElementById('macroContent').value = macros[name];
        };
        list.appendChild(li);
    }
}
document.getElementById('addMacroBtn')?.addEventListener('click', () => {
    const name = document.getElementById('macroName').value.trim();
    const content = document.getElementById('macroContent').value;
    if (name && content) {
        macros[name] = content;
        saveMacros();
        refreshMacroListUI();
        showStatus(`宏“${name}”已保存`);
        document.getElementById('macroName').value = '';
        document.getElementById('macroContent').value = '';
    } else {
        showStatus('请填写宏名称和内容', true);
    }
});
document.getElementById('deleteMacroBtn')?.addEventListener('click', () => {
    const name = document.getElementById('macroName').value.trim();
    if (name && macros[name]) {
        delete macros[name];
        saveMacros();
        refreshMacroListUI();
        showStatus(`宏“${name}”已删除`);
        document.getElementById('macroName').value = '';
        document.getElementById('macroContent').value = '';
    } else {
        showStatus('请填写要删除的宏名称', true);
    }
});
refreshMacroListUI();

window.addEventListener('load', () => {
    recognition = initRecognition();
});