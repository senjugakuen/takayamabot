const fs = require("fs")
const path = require("path")
const vm = require("vm")
const dataPath = path.join(__dirname, "data")
const contextFile = path.join(dataPath, "context")
const fnFile = path.join(dataPath, "context.fn")
const initCodeFile = path.join(__dirname, "sandbox.code.js")
if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, {recursive: true, mode: 0o700})
}

let context = {}
if (fs.existsSync(contextFile)) {
    context = JSON.parse(fs.readFileSync(contextFile))
}
vm.createContext(context, {
    codeGeneration: {
        strings: false,
        wasm: false
    }
})
if (fs.existsSync(fnFile)) {
    let fn = JSON.parse(fs.readFileSync(fnFile))
    for (let k in fn) {
        try {
            vm.runInContext(k + "=" + fn[k], context)
        } catch(e) {}
    }
}

vm.runInContext(fs.readFileSync(initCodeFile), context)

let fn = {}
const beforeSaveContext = ()=>{
    fn = {}
    for (let k in context) {
        if (typeof context[k] === "function") {
            fn[k] = context[k].toString()
        }
        if (typeof context[k] === "object") {
            try {
                if (JSON.stringify(context[k]).length > 10485760)
                    delete context[k]
            } catch (e) {
                delete context[k]
            }
        }
    }
    vm.runInContext(`data={}`, context)
}
process.on("exit", (code)=>{
    beforeSaveContext()
    fs.writeFileSync(fnFile, JSON.stringify(fn))
    fs.writeFileSync(contextFile, JSON.stringify(context))
})
setInterval(()=>{
    beforeSaveContext()
    fs.writeFile(fnFile, JSON.stringify(fn), (err)=>{})
    fs.writeFile(contextFile, JSON.stringify(context), (err)=>{})
}, 1800000)

let timeout = 50
const run = (code, isAdmin = false)=>{
    let debug = ["\\","＼"].includes(code.substr(0, 1))
    if (!isAdmin && code.match(/([^\w]|^)+(this|async|const){1}([^\w]|$)+/))
        return debug ? "代码不要包含this、async、const关键字。" : undefined
    if (debug)
        code = code.substr(1)
    code = code.replace(/(（|）|，|″|“|”|＝|&amp;|&#91;|&#93;)/g, (s)=>{
        if (["″","“","”"].includes(s)) return "\""
        if (s === "，") return ","
        if (s === "＝") return "="
        if (s === "&amp;") return "&"
        if (s === "&#91;") return "["
        if (s === "&#93;") return "]"
        return String.fromCharCode(s.charCodeAt(0) - 65248)
    })
    try {
        return vm.runInContext(code, context, {timeout: timeout})
    } catch(e) {
        if (debug) {
            let line = e.stack.split("\n")[0].split(":").pop()
            return e.name + ": " + e.message + " (line: " + parseInt(line) + ")"
        }
    }
}

module.exports.require = (name, object)=>{
    context[name] = object
    vm.runInContext(`const ${name} = this.${name}
delete this.${name}
Object.freeze(${name})
Object.freeze(${name}.prototype)`, context)
}
module.exports.run = run
module.exports.getContext = ()=>context
module.exports.setTimeout = (t)=>{
    timeout = t
}
