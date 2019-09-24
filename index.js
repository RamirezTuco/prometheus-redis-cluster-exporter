const app = require('express')();
let Redis = require("ioredis");
const parser = require("redis-info");
const promClient = require('prom-client');

const metrics = {
    redis_stats: new promClient.Gauge({ name: 'redis_stats', labelNames: ['instance', 'key'], help: 'redis key for that instance' }),
};

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

    return processedJson;
}


let config = {
    connect: {
        targets: process.env["TARGETS"] || "127.0.0.1:6379"
    },
    port: process.env["EXPOSE"] || 8080
};

const connectToNode = async function (host, port) {
    return new Promise((resolve, reject) => {
        let client = new Redis({ host: host, port: port });
        client.on('connect', (err) => {
            if (err) {
                console.log('error while connecting to redis');
                reject(err);
            } else {
                resolve(client);
            }
            client.on('close', () => {
                console.log('connection to redis closed');
            });
        });
    });
}

const pushStatsForNode = async function(client, host, port){
    return new Promise((resolve, reject) => {
        client.info('all', async function(err, res){
            if(err){
                reject(err);
            } else {
                let info = parser.parse(res);
                info = processJSON(info);

                let uri = `${host}:${port}`;
        
                for (var key in info) {
                    if (info.hasOwnProperty(key)) {
                        const val = info[key];
                        if (!isNaN(val)) {
                            metrics.redis_stats.labels(uri, key).set(Number(val));
                        }
                    }
                }
                resolve();
            }
        });
    });
}

const connectToCluster = async function () {
    return new Promise((resolve, reject) => {
        const clusterString = config.connect.targets;
        const connectArr = clusterString.split(",").map((str)=> {let arr = str.split(":"); return {host: arr[0], port: Number(arr[1])}});
        let cluster = new Redis.Cluster(connectArr);
        cluster.on('connect', (err) => {
            if (err) {
                console.log(`error while connecting to redis cluster`, err);
                reject(err);
            } else {
                resolve(cluster);
            }
        });
        cluster.on('close', () => {
            console.log('connection to cluster closed');
        });
    });
}

const processClusterNodes = async function(cluster){
    await Promise.all(cluster.nodes().map(async (node) => {
        let client = await connectToNode(node.options.host, node.options.port);
        await pushStatsForNode(client, node.options.host, node.options.port);
        await client.disconnect();
    }));
}

app.get('/metrics', async (req, res) => {
    res.contentType(promClient.register.contentType);
    console.log(promClient.register.contentType);
    try {
        let cluster = await connectToCluster();
        await processClusterNodes(cluster);
        await cluster.disconnect();

        res.send(promClient.register.metrics());
    } catch (error) {
        console.log(error);
        res.send(promClient.register.metrics());
    }
});

const server = app.listen(config.port, function () {
    console.log(`Prometheus-Redis Exporter listening on local port ${config.port} monitoring ${config.connect.targets}`);
});

process.on('SIGINT', function () {
    server.close();
    process.exit(0);
});
