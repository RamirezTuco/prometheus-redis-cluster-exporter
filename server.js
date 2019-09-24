let Redis = require("ioredis");
let cluster = new Redis.Cluster([{"host": "127.0.0.1", port: 30001}]);
const parser = require("redis-info");

const processJSON = function(info){
    let processedJson = {
        "used_memory": info.used_memory,
        "used_memory_rss": info.used_memory_rss,
        "used_memory_peak": info.used_memory_peak,
        "uptime_in_seconds": info.uptime_in_seconds,
        "connected_clients": info.connected_clients,
        "used_memory": info.used_memory,
        "used_memory_rss": info.used_memory_rss,
        "used_memory_peak": info.used_memory_peak,
        "used_memory_dataset_perc": info.used_memory_dataset_perc,
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

cluster.on('connect', (err) => {
    if(err){
        console.log(`error while connecting to db`, err);
    } else {
        cluster.nodes().forEach(node => {
            let uri = `${node.host}:${node.port}`;
            let client = new Redis({host: node.options.host, port: node.options.port});
            client.on('connect', (err) => {
                if(err){
                    console.log('error while connecting to redis');
                } else {
                    client.info('all', async function (err, res) {
                        let info = parser.parse(res);
                        //console.log(info);
                        info = processJSON(info);
                        info.host = node.options.host;
                        info.port = node.options.port;
                        info.uri = `${info.host}:${info.port}`;
                        console.log(info);
                    });
                    client.disconnect();
                }
            });
                
        });
        cluster.disconnect();
    }
});
console.log('done');

