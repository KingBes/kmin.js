# kmin.js

<center>
    <img width="300" src="./logo.png" alt="kmin.js" />
</center>

> kmin.js 是一个基于 web component 的前端组件框架，它的目标是简化前端开发，提高开发效率。

您可以使用 kmin.js 构建几乎任何类型的 Web UI！

关于 kmin.js 首先要了解的是，每个 kmin.js 组件都是一个标准的 Web 组件。

Web 组件具有互作性的超能力：Web 组件由浏览器原生支持，可以在任何 HTML 环境中使用，使用任何框架或根本没有框架。

## 安装

```html
<script src="./kmin.min.js"></script>
<!-- 或者 -->
<script src="./kmin.js"></script>
```

## 示例

```html
<km-demo></km-demo>
<script>
    customElements.define('km-demo', class extends KMin {
        // 定义动态数据
        data = this.state({
            name: 'kmin'
        })

        // css
        css() {
            return `
            span{
                color: red;
            }
            `
        }
        // 渲染
        render() {
            return `
            <span>hello {{data.name}}</span>
            `;
        }
    });
</script>
```
