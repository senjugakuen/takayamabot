const http = require("http")
const https = require("https")
const crypto = require("crypto")
const sandbox = require("./modules/sandbox/sandbox")

const $ = sandbox.run(`new String(\`这是一个云JavaScript环境。聊天窗口就是控制台。
该文档可能需要一定的编程基础才能充分理解。
该文档默认你会使用JavaScript, 或其他类似语言。
http://usus.lietxia.bid/bot.html\`)`)

let rest = 3
setInterval(()=>{
    rest = 3
}, 50)
const checkFrequency = ()=>{
    if (rest === 0)
        throw new Error("调用频率太快")
    --rest
}

const getGid = ()=>sandbox.getContext().data.group_id

sandbox.include("向听", require("syanten"))

const set_timeout_queue = []
sandbox.include("setTimeout", (fn, timeout = 1000, argv = [])=>{
    checkFrequency()
    if (typeof fn !== "function")
        sandbox.throw("TypeError", "The first param must be a function")
    timeout = parseInt(timeout)
    if (isNaN(timeout) || timeout < 1000)
        sandbox.throw("Error", "时间不能小于1000毫秒")
    let env = sandbox.getContext().data
    let key = crypto.createHash("md5").update(fn.toString() + JSON.stringify(env)).digest("hex")
    if (set_timeout_queue.includes(key))
        return
    else
        set_timeout_queue.push(key)
    let cb = ()=>{
        sandbox.setEnv(env)
        let function_name = "tmp"+Date.now()
        sandbox.getContext()[function_name] = fn
        sandbox.run(`${function_name}.apply(null, ${JSON.stringify(argv)})`)
        sandbox.run(`delete ${function_name}`)
        set_timeout_queue.splice(set_timeout_queue.indexOf(key), 1)
    }
    setTimeout(cb, timeout)
})
const fetch = (url, callback = ()=>{}, headers = null)=>{
    checkFrequency()
    if (typeof url !== "string")
        sandbox.throw("TypeError", "The first param must be a string")
    if (typeof callback !== "function")
        sandbox.throw("TypeError", "The second param must be a function")
    if (typeof headers !== "object")
        sandbox.throw("TypeError", "The third param must be an object")
    let env = sandbox.getContext().data
    let cb = (data)=>{
        sandbox.setEnv(env)
        let function_name = "tmp"+Date.now()
        sandbox.getContext()[function_name] = callback
        sandbox.run(`${function_name}(${JSON.stringify(data)})`)
        sandbox.run(`delete ${function_name}`)
    }
    url = url.trim()
    let protocol = url.substr(0, 5) === "https" ? https : http
    let data = []
    let size = 0
    const options = {}
    if (headers) {
        options.headers = headers
    }
    try {
        protocol.get(url, options, (res)=>{
            if (res.statusCode !== 200) {
                cb(JSON.stringify({code: res.statusCode}))
                return
            }
            res.on("data", chunk=>{
                size += chunk.length
                if (size > 1000000) {
                    res.destroy()
                    return
                }
                data.push(chunk)
            })
            res.on("end", ()=>cb(Buffer.concat(data).toString()))
        }).on("error", err=>cb(JSON.stringify(err)))
    } catch (e) {
        cb(JSON.stringify(e))
    }
}
sandbox.include("fetch", fetch)
$.ajax = fetch
$.get = fetch

module.exports = (bot)=>{

    //初始化数据，主要是获取群和群员列表
    const groups = new Proxy(Object.create(null), {
        get: (o, k)=>{
            if (o[k]) {
                if (Date.now() - o[k].update_time >= 1800000)
                    updateGroupCache(k)
                return o[k]
            } else {
                updateGroupCache(k)
                return undefined
            }
        }
    })
    const updateGroupCache = async(gid, cache = false)=>{
        gid = parseInt(gid)
        let group = (await bot.getGroupInfo(gid, cache)).data
        let members = (await bot.getGroupMemberList(gid)).data
        if (!group || !members)
            return
        group.update_time = Date.now()
        group = Object.setPrototypeOf(group, null)
        group.members = Object.create(null)
        for (let v of members) {
            group.members[v.user_id] = Object.setPrototypeOf(v, null)
            Object.freeze(group.members[v.user_id])
        }
        groups[gid] = group
        Object.freeze(groups[gid])
    }
    const initQQData = async()=>{
        let res = await bot.getGroupList()
        if (!res.retcode && res.data instanceof Array) {
            for (let v of res.data) {
                await updateGroupCache(v.group_id, true)
            }
        }
    }

    bot.on("connection", ()=>{
        initQQData()
    })

    //传递给沙盒的事件
    bot.on("message", (data)=>{
        sandbox.setEnv(data)
        sandbox.run(`this.onEvents()`, true)
    })
    bot.on("notice", (data)=>{
        if (["group_admin","group_decrease","group_increase"].includes(data.notice_type))
            updateGroupCache(data.group_id)
        sandbox.setEnv(data)
        sandbox.run(`this.onEvents()`, true)
    })
    bot.on("request", (data)=>{
        sandbox.setEnv(data)
        sandbox.run(`this.onEvents()`, true)
    })

    // bot api
    $.getGroupInfo = ()=>{
        let gid = getGid()
        return groups[gid]
    }
    // $.updateGroupCache = ()=>{
    //     let gid = getGid()
    //     checkFrequency()
    //     updateGroupCache(gid)
    // }
    $.sendPrivateMsg = (uid, msg, escape = false)=>{
        checkFrequency()
        bot.sendPrivateMsg(uid, msg, escape)
    }
    $.sendGroupMsg = (gid, msg, escape = false)=>{
        checkFrequency()
        bot.sendGroupMsg(gid, msg, escape)
    }
    $.deleteMsg = (message_id)=>{
        checkFrequency()
        bot.deleteMsg(message_id)
    }
    $.setGroupKick = (uid, forever = false)=>{
        let gid = getGid()
        checkFrequency()
        bot.setGroupKick(gid, uid, forever)
    }
    $.setGroupBan = (uid, duration = 60)=>{
        let gid = getGid()
        checkFrequency()
        bot.setGroupBan(gid, uid, duration)
    }
    $.setGroupAnonymousBan = (flag, duration = 60)=>{
        let gid = getGid()
        checkFrequency()
        bot.setGroupAnonymousBan(gid, flag, duration)
    }
    $.setGroupAdmin = (uid, enable = true)=>{
        let gid = getGid()
        checkFrequency()
        bot.setGroupAdmin(gid, uid, enable)
    }
    $.setGroupWholeBan = (enable = true)=>{
        let gid = getGid()
        checkFrequency()
        bot.setGroupWholeBan(gid, enable)
    }
    $.setGroupAnonymous = (enable = true)=>{
        let gid = getGid()
        checkFrequency()
        bot.setGroupAnonymous(gid, enable)
    }
    $.setGroupCard = (uid, card = undefined)=>{
        let gid = getGid()
        checkFrequency()
        bot.setGroupCard(gid, uid, card)
    }
    $.setGroupLeave = (dismiss = false)=>{
        let gid = getGid()
        checkFrequency()
        bot.setGroupLeave(gid, dismiss)
    }
    $.setGroupSpecialTitle = (uid, title, duration = -1)=>{
        let gid = getGid()
        checkFrequency()
        bot.setGroupSpecialTitle(gid, uid, title, duration)
    }
    $.sendGroupNotice = (title, content)=>{
        let gid = getGid()
        checkFrequency()
        bot.sendGroupNotice(gid, title, content)
    }
    $.setGroupRequest = (flag, approve = true, reason = undefined)=>{
        checkFrequency()
        bot.setGroupRequest(flag, approve, reason)
    }
    $.setFriendRequest = (flag, approve = true, remark = undefined)=>{
        if (!sandbox.getContext().isMaster())
            return
        bot.setFriendRequest(flag, approve, remark)
    }
    $.setGroupInvitation = (flag, approve = true, reason = undefined)=>{
        if (!sandbox.getContext().isMaster())
            return
        bot.setGroupInvitation(flag, approve, reason)
    }

    sandbox.include("$", $)
}
