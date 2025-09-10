/**
 * 引入组件模板
 * 
 * @param {string} url 组件路径
 * @returns {Promise<void>}
 */
export async function impComp(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch component: ${res.statusText}`);
        const text = await res.text()
        const dom = new DOMParser().parseFromString(text, 'text/html');
        const template = text.match(/<template>([\s\S]*?)<\/template>/)[1];
        let script = dom.querySelector('script').innerHTML;
        script = script
            .replace(/\s*extends\s*KMin\s*{/g,
                ` extends KMin { css() { return \`${dom.querySelector('style').innerHTML}\`; } render() { return \`${template}\`; } `);
        const newScript = document.createElement('script');
        newScript.type = 'module';
        newScript.textContent = script;
        document.head.appendChild(newScript);
    } catch (error) {
        console.error(error);
    }
}

/**
 * 自定义组件
 */
export class KMin extends HTMLElement {

    /**
     * 自定义元素的构造函数
     */
    constructor() {
        // 必须首先调用 super 方法
        super();
        // 创建一个 Shadow DOM
        this.attachShadow({ mode: "open" });
        // 渲染样式
        let sheet = new CSSStyleSheet();
        sheet.replaceSync(this.css());
        this.shadowRoot.adoptedStyleSheets = [sheet];
        this.eventListeners = []; // 事件存储器
    }

    /**
     * 定义响应式属性
     * 
     * @param {Object} value - 组件状态数据
     * @returns {Proxy} - 响应式代理对象
     */
    state(value) {
        const then = this;
        return new Proxy(value, {
            get(target, key, rec) {
                const value = Reflect.get(target, key, rec);
                if (typeof value === 'object' && value !== null) {
                    return then.state(value);
                }
                return value;
            },
            set(target, key, val, rec) {
                Reflect.set(target, key, val, rec);
                then.updateComponent();
                return true;
            }
        })
    }

    /**
     * 执行组件更新（虚拟DOM对比）
     * 
     * @returns {void}
     */
    updateComponent() {
        const newTemplate = this.render();
        this.#_processTemplate(newTemplate);
    }

    /**
      * 处理模板字符串（包含事件绑定）
      * 
      * @param {string} template - 模板字符串
      * @returns {void}
      */
    #_processTemplate(template) {
        // 模板解析
        this.#diff(this.shadowRoot.childNodes, parseHTML(this.#tpl(template)));
        // 事件绑定处理
        let eventHandlers = this.shadowRoot.querySelectorAll('[data-event]');
        eventHandlers.forEach((element) => {
            const data = element.getAttribute('data-event').split(",");
            // 删除属性
            element.removeAttribute('data-event');
            if (this.eventListeners.find((item) =>
                item.element === element
                && item.type === data[0])) {
                return;
            }
            this.eventListeners.push({
                element: element,
                type: data[0],
                handler: data[1]
            })
            element.addEventListener(data[0], (e) => {
                if (this[data[1]]) {
                    this[data[1]].call(this, e);
                }
            })
        })
    }

    /**
     * 自定义元素添加至页面时调用
     * 
     * @returns {void}
     */
    connectedCallback() {
        this.updateComponent();
    }

    /**
     * 模板渲染
     * 
     * @param {string} template - 模板字符串
     * @returns {string} 渲染后的HTML字符串
     */
    #tpl(template) {
        template = template
            // if if-else else
            .replace(/\{\#if\s+([^}]*)\}/g,
                (_, p1) => '`;if(' + kmComparison(p1) + ') {km_tpl+=`')
            .replace(/\{\#else\s+if\s+([^}]*)\}/g,
                (_, p1) => '`;} else if(' + kmComparison(p1) + ') {km_tpl+=`')
            .replace(/\{\#else\}/g, '`;} else {km_tpl+=`')
            .replace(/\{\/if\}/g, '`;}km_tpl+=`')
            // for
            .replace(/\{\#for\s+([^}]*)}/g,
                (_, p1) => '`;for(' + kmComparison(p1) + ') {km_tpl+=`')
            .replace(/\{\/for\}/g, '`;}km_tpl+=`')
            // each
            .replace(/\{\#each\s+([^}]+)\s+as\s+([^}]+)}/g, '`;$1.forEach(function($2){km_tpl+=`')
            .replace(/\{\/each\}/g, '`;});km_tpl+=`')
            // 事件绑定
            .replace(/@([a-z]+)="([\w$]+)"/g,
                (_, p1, p2) => `data-event="${p1},${p2}"`)
            // 安全变量
            .replace(/\{\{([^}]*)\}\}/g, "${kmHtml($1)}")
            // Html内容插入
            .replace(/\{\#html\s+([^}]*)\}/g, "${kmHtml($1,false)}")
        const str = `let km_tpl = \`${template}\`; return km_tpl;`
        try {
            const args = Object.keys(this);
            args.push('kmHtml');
            const fn = new Function(...args, str);
            return fn(...args.map(key => this[key]));
        } catch (e) {
            throw new Error('Template error, ' + e.message);
        }
    }

    /**
     * 转义HTML特殊字符
     * 
     * @param {any} input - 输入字符串
     * @param {boolean} is - 是否转义
     * 
     * @returns {string} 转义后的字符串
     */
    kmHtml(input, is = true) {
        // 处理空值和函数
        if (input == null) return '';
        if (typeof input === 'function') return kmHtml(input());
        // 处理数组
        if (Array.isArray(input)) {
            const len = input.length;
            // 预初始化数组避免push开销
            const escaped = new Array(len);
            for (let i = 0; i < len; i++) {
                escaped[i] = kmHtml(input[i]);
            }
            return escaped.join(',');
        }
        // 转换非字符串为字符串
        const str = String(input);
        if (!is) return str;
        // 转义HTML特殊字符
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        const escapePattern = /[&<>"']/g;
        // 快速检查是否需要转义
        if (!escapePattern.test(str)) return str;
        return str.replace(escapePattern, char => escapeMap[char]);
    }

    /**
     * 对比两个DOM节点列表的差异
     * 
     * @param {NodeListOf<ChildNode>} oldDom 旧DOM节点列表
     * @param {NodeListOf<ChildNode>} newDom 新DOM节点列表
     */
    #diff(oldDoms, newDoms) {
        for (let i = 0; i < oldDoms.length; i++) {
            const oldDom = oldDoms[i];
            const newDom = newDoms[i];
            // 节点不存在
            if (!newDom) {
                oldDom.removeChild(oldDom.children[i]);
                continue;
            }
            // 文本节点比较
            if (oldDom.nodeType === 3 || newDom.nodeType === 3) {
                if (oldDom.nodeValue !== newDom.nodeValue) {
                    oldDom.nodeValue = newDom.nodeValue;
                }
                continue;
            }
            // 标签名不同，直接替换
            if (oldDom.nodeName !== newDom.nodeName) {
                oldDom.outerHTML = newDom.outerHTML;
                continue;
            }
            // 属性比较
            const oldAttrs = oldDom.attributes;
            const newAttrs = newDom.attributes;
            if (typeof oldAttrs !== "undefined") {
                for (let j = 0; j < oldAttrs.length; j++) {
                    const oldAttr = oldAttrs[j];
                    const newAttr = newAttrs[j];
                    // 属性删除
                    if (!newAttrs[j]) {
                        oldDom.removeAttribute(oldAttr.name);
                        continue;
                    }
                    // 修改属性
                    if (oldAttr.name !== newAttr.name) {
                        oldDom.setAttribute(oldAttr.name, newAttr.value);
                    }
                    if (oldAttr.value !== newAttr.value) {
                        oldDom.setAttribute(oldAttr.name, newAttr.value);
                    }
                }
            }
            // 属性追加
            if (typeof newAttrs !== "undefined") {
                for (let j = 0; j < newAttrs.length; j++) {
                    const newAttr = newAttrs[j];
                    if (!oldAttrs[j]) {
                        oldDom.setAttribute(newAttr.name, newAttr.value);
                    }
                }
            }

            // 子节点比较
            this.#diff(oldDom.childNodes, newDom.childNodes);
        }

        // 检查新增节点
        if (newDoms.length > oldDoms.length) {
            for (let j = oldDoms.length; j < newDoms.length; j++) {
                if (oldDoms[0]) {
                    oldDoms[0].parentNode.appendChild(newDoms[j].cloneNode(true));
                } else {
                    this.shadowRoot.appendChild(newDoms[j].cloneNode(true));
                }
            }
        }
    }

    css() { return ''; } // 定义样式
    render() { return ''; } // 渲染模板
    disconnectedCallback() { } // 自定义元素从页面中移除时调用
    adoptedCallback() { } // 自定义元素移动至新页面时调用
    attributeChangedCallback(name, oldValue, newValue) { } // 自定义元素的属性变更时调用
}

/**
 * 比较表达式解析
 * 
 * @param {string} exp - 表达式字符串
 * 
 * @returns {string} 表达式结果
 */
function kmComparison(exp) {
    const map = {
        'eq': '==',
        'neq': '!=',
        'gt': '>',
        'egt': '>=',
        'lt': '<',
        'elt': '<=',
        'heq': '===',
        'nheq': '!=='
    };
    // 按标识符长度降序排序（避免短标识符先匹配长标识符的部分内容）
    const keys = Object.keys(map).sort((a, b) => b.length - a.length);
    // 转义特殊字符并构建匹配模式
    const pattern = keys
        .map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // 正则转义
        .join('|');
    // 创建单词边界匹配的正则表达式
    const regex = new RegExp(`\\b(${pattern})\\b`, 'g');
    // 执行替换
    return exp.replace(regex, match => map[match]);
}

/**
 * 解析HTML字符串为DOM节点列表
 * 
 * @param {string} htmlString HTML字符串
 * 
 * @returns {NodeListOf<ChildNode>} DOM节点列表
 */
function parseHTML(htmlString) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;
    return tempDiv.childNodes;
}

/**
 * 事件派发
 */
export class Event {

    /**
     * 初始化
     * @param {HTMLElement} component 组件实例
     */
    constructor(component) {
        this.component = component;
        this.Components = new Map();
        this.eventListeners = new Map();
    }

    /**
     * 注册组件事件
     * 
     * @param {string} name - 组件名称（标识）
     * @param {string|HTMLElement} selectorOrElement - 选择器或元素实例
     * 
     * @returns {boolean} 是否注册成功
     */
    register(name, selectorOrElement) {
        const element = typeof selectorOrElement === 'string'
            ? (this.component.shadowRoot || this.component).querySelector(selectorOrElement)
            : selectorOrElement;
        if (!element) return false;
        this.Components.set(name, element);
        return true;
    }

    /**
     * 调用组件方法
     * 
     * @param {string} name - 组件名称
     * @param {string} methodName - 方法名称
     * @param {...any} args - 方法参数
     * 
     * @returns {any} 方法返回值
     */
    call(name, methodName, ...args) {
        const child = this.Components.get(name);
        if (!child) {
            console.warn(`Component "${name}" not registered`);
            return null;
        };
        const fn = child[methodName];
        if (typeof fn !== 'function') {
            console.warn(`Method "${methodName}" not found in "${name}"`);
            return null;
        }
        try {
            return fn.apply(child, args);
        } catch (error) {
            console.error(`Error calling "${methodName}" on "${name}":`, error);
        }
        return null;
    }

    /**
     * 监听子组件事件
     * 
     * @param {string} name - 组件名称
     * @param {string} eventName - 事件名称
     * @param {Function} handler - 事件处理函数
     * 
     * @returns {void}
     */
    on(name, eventName, handler) {
        const child = this.Components.get(name);
        if (!child) return console.warn(`listen event failed, component "${name}" not register`);
        // 存储事件监听器以便后续移除
        const key = `${name}-${eventName}`;
        this.eventListeners.set(key, { child, eventName, handler });
        child.addEventListener(eventName, handler);
    }

    /**
     * 移除组件事件监听
     * @param {string} name - 组件名称
     * @param {string} eventName - 事件名称
     */
    off(name, eventName) {
        const key = `${name}-${eventName}`;
        const listener = this.eventListeners.get(key);
        if (listener) {
            listener.child.removeEventListener(listener.eventName, listener.handler);
            this.eventListeners.delete(key);
        }
    }

    /**
     * 向父组件发送事件
     * @param {string} eventName - 事件名称
     * @param {any} data - 要传递的数据
     */
    emit(eventName, data) {
        this.component.dispatchEvent(new CustomEvent(eventName, {
            detail: data,
            bubbles: true,
            composed: true
        }));
    }

    /**
     * 清理所有事件监听和注册
     */
    destroy() {
        // 移除所有事件监听
        this.eventListeners.forEach(({ child, eventName, handler }) => {
            child.removeEventListener(eventName, handler);
        });
        // 清空存储
        this.Components.clear();
        this.eventListeners.clear();
    }
}


// 判断是否是浏览器环境
if (typeof window !== 'undefined') {
    // 浏览器环境，挂载到window
    window.KMin = KMin;
    window.impComp = impComp;
    window.Event = Event;
}