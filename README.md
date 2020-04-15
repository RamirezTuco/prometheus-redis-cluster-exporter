# prometheus-redis-cluster-exporter
repository for prometheus exporter of redis cluster

# Usage
PARAMS=namespace=mynamespace,identifier=reco TARGETS=127.0.0.1:30001,127.0.0.1:30002 node index.js

After that use localhost:8080/metrics to get the metrics.

# Params
  - PARAMS - optional param(s) specified as a=A or a=A,b=B
  - TARGETS - optional target(s) with default to 127.0.0.1:6379

