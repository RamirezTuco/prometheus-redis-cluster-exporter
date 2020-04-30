const app = require('express')();
let Redis = require("ioredis");
const parser = require("redis-info");
const promClient = require('prom-client');

const params={};
const paramsStr=process.env["PARAMS"];
paramsStr ? paramsStr.split(',').map(function(x) {let a=x.split('='); if(a.length > 1){let k=a[0]; let v=a[1]; params[k]=v};}): paramsStr;
console.log(`params are ${JSON.stringify(params)}`);

const keysArr = Object.keys(params);
const valuesArr = Object.values(params);

const metrics = {
    redis_stats: new promClient.Gauge({ name: 'redis_stats', labelNames: ['node', 'key'].concat(keysArr), help: 'redis key for that node' }),
    redis_replication_stats : new promClient.Gauge({ name: 'redis_replication_stats', labelNames: ['slave', 'master', 'link_status'].concat(keysArr), help: 'redis replication stats for that node' }),
};

promClient.collectDefaultMetrics();

const processJSON = function (info) {
    let processedJson = {
        "used_memory": info.used_memory,
        "used_memory_rss": info.used_memory_rss,
        "used_memory_peak": info.used_memory_peak,
        "uptime_in_seconds": info.uptime_in_seconds,
        "connected_clients": info.connected_clients,
        "used_memory": info.used_memory,
        "used_memory_rss": info.used_memory_rss,
        "used_memory_peak": info.used_memory_peak,
        "total_system_memory": info.total_system_memory,
        "mem_fragmentation_ratio": info.mem_fragmentation_ratio,
        "total_net_input_bytes": info.total_net_input_bytes,
        "total_net_output_bytes": info.total_net_output_bytes,
        "expired_keys": info.expired_keys,
        "evicted_keys": info.evicted_keys,
        "used_cpu_sys": info.used_cpu_sys,
        "used_cpu_user": info.used_cpu_user,
        "used_cpu_sys_children": info.used_cpu_sys_children,
        "used_cpu_user_children": info.used_cpu_user_children
    }

    if (info.hasOwnProperty('commands')) {
        let commandskeys = Object.keys(info.commands);
        commandskeys.forEach((element) => {
            let cmdinnerkeysarr = Object.keys(info.commands[element])
            cmdinnerkeysarr.forEach((innerkey) => {
                processedJson[`cmdstat_${element}_${innerkey}`] = info.commands[element][innerkey]
            })
        })
    }

    if (info.hasOwnProperty('databases')) {
        let databaseskeys = Object.keys(info.databases);

        databaseskeys.forEach((element) => {
            let dbinnerkeysarr = Object.keys(info.databases[element])
            dbinnerkeysarr.forEach((innerkey) => {
                processedJson[`db${element}_${innerkey}`] = info.databases[element][innerkey]
            })
        })
    }

    const role = info.role;
    if(role == 'slave'){
        processedJson['master']=`${info.master_host}-${info.master_port}`;
        processedJson['link_status']=info.master_link_status;
        processedJson['slave_repl_offset']=info.slave_repl_offset;
    }

    return processedJson;
}


let config = {
    connect: {
        targets: process.env["TARGETS"] || "127.0.0.1:6379"
    },
    port: process.env["EXPOSE"] || 8080
};

const targetsString = config.connect.targets;

const connectArr = targetsString.split(",").map((str)=> {let array = str.split("@"); let auth = array.length == 2 ? array[0] : ""; let arr = array.length == 2 ? array[1].split(":") : array[0].split(":"); let host=arr[0]; let port= arr.length > 1 ? arr[1] : 6379 ; return {host: host, port: Number(port), password: auth}});

const connectToNode = async function (connectData) {
    return new Promise((resolve, reject) => {
        let client = new Redis(connectData);
        client.on('connect', (err) => {
            if (err) {
                console.log('error while connecting to redis');
                reject(err);
            } else {
                resolve(client);
            }
        });
        client.on('close', () => {
            console.log(`connection to redis ${connectData.host}:${connectData.port} closed`);
        });
        client.on('error', () => {
            reject();
        });
    });
}

const pushStatsForNode = async function(client, nodeconfig){
    return new Promise((resolve, reject) => {
        let host = nodeconfig.host;
        let port = nodeconfig.port;
        client.info('all', async function(err, res){
            if(err){
                reject(err);
            } else {
                let info = parser.parse(res);
                info = processJSON(info);
                //console.log(info);
                let uri = `${host}:${port}`;
        
                for (var key in info) {
                    if (info.hasOwnProperty(key)) {
                        const val = info[key];
                        if (!isNaN(val)) {
                            //const label
                            metrics.redis_stats.labels(...[uri.replace(/\.|:/g,'-'), key].concat(valuesArr)).set(Number(val));
                        }
                    }
                }
                if(info.master){
                    metrics.redis_replication_stats.labels(...[uri.replace(/\.|:/g,'-'), info.master, info.link_status].concat(valuesArr)).set(Number(info.slave_repl_offset    ));
                    //redis_replication_stats : new promClient.Gauge({ name: 'redis_replication_stats', labelNames: ['slave', 'master', 'link_status'].concat(keysArr), help: 'redis replication stats for that node' }),

                }
                resolve();
            }
        });
    });
}


const connectToTargets = async function () {
    await Promise.all(connectArr.map(async (nodeconfig) => {
        let client = await connectToNode(nodeconfig);
        await pushStatsForNode(client, nodeconfig);
        await client.disconnect();
    }));
}

app.get('/metrics', async (req, res) => {
    res.contentType(promClient.register.contentType);
    try {
        await connectToTargets(); 
        res.send(promClient.register.metrics());
    } catch (error) {
        console.log(error);
        res.send(promClient.register.metrics());
    }
});

const server = app.listen(config.port, function () {
    console.log(`Prometheus-Redis Exporter listening on local port ${config.port} monitoring ${JSON.stringify(connectArr)} with params ${JSON.stringify(params)}`);
});

process.on('SIGINT', function () {
    server.close();
    process.exit(0);
});
