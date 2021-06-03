var opcua = require("node-opcua");
var async = require("async");

var coerceId = opcua.coerceNodeId;
var client = new opcua.OPCUAClient();
var endpointUrl = "opc.tcp://" + require("os").hostname() + ":3003/MyLittleServer";


var tank1, the_subscription;

async.series([

        // step 1 : connect to
        function(callback)  {
            client.connect(endpointUrl,function (err) {
                if(err) {
                    console.log(" cannot connect to endpoint :" , endpointUrl );
                } else {
                    console.log("connected !");
                }
                callback(err);
            });
        },

        // step 2 : createSession
        function(callback) {
            client.createSession( function(err,session) {
                if(!err) {
                    tank1 = session;
                }
                callback(err);
            });
        },

        // step 3 : browse
        function(callback) {
            tank1.browse("RootFolder", function(err,browseResult){
                if(!err) {
                    browseResult.references.forEach(function(reference) {
                        console.log( reference.browseName.toString());
                    });
                }
                callback(err);
            });
        },

// trigger start experiment to server

        function(callback) {
            var payload = [];
            payload.push({
                objectId: coerceId('ns=1;i=1000'),
                methodId: coerceId("ns=1;i=1003"),
                inputArguments: []
            });
            tank1.call(payload,function (err, result) {
                console.log(err)
                console.log(result)
            });
            callback();
        },

// step 5: install a subscription and install a monitored item
        function(callback) {
            the_subscription=new opcua.ClientSubscription(tank1,{
                requestedPublishingInterval: 10,
                requestedLifetimeCount: 10,
                requestedMaxKeepAliveCount: 2,
                maxNotificationsPerPublish: 100,
                publishingEnabled: true,
                priority: 10
            });

// get the water level value to control the outlet valve

            var monitoredItem  = the_subscription.monitor({
                    nodeId: opcua.resolveNodeId('ns=1;s=water_level'),
                    attributeId: opcua.AttributeIds.Value
                },
                {
                    samplingInterval: 1,
                    discardOldest: true,
                    queueSize: 10
                },
                opcua.read_service.TimestampsToReturn.Both
            );

            monitoredItem.on("changed",function(dataValue){
                var actualValue = dataValue.value.value;
                var setpoint = 6.5; //point where level is supposed to set
                var diff = Math.abs(setpoint - actualValue);
                var valveOpening;
                var controllerMultiplier = 5.905; //P-controller multiplier

                // when water level is between 6 and 7, the P-controller is controlling the output valve

                //this part works when water level is less than setpoint in P-control area
                console.log("waterLevel", actualValue);
                if ((actualValue >= 6 && actualValue <= 7) && (actualValue <= setpoint)){
                    valveOpening = 0.5 - controllerMultiplier * diff;
                    if(valveOpening > 1){
                        valveOpening = 1;
                    };
                    if(valveOpening < 0){
                        valveOpening = 0;
                    };
                    var payload = [];
                    payload.push({
                        objectId: coerceId('ns=1;i=1000'),
                        methodId: coerceId("ns=1;i=1001"),
                        inputArguments: [{
                            dataType: opcua.DataType.Float,
                            arrayType: opcua.VariantArrayType.Scalar,
                            value: valveOpening}
                        ]
                    });
                    tank1.call(payload,function (err, result) {
                        //console.log(err)
                        //console.log(result)
                    });
                };

                //this part workswhen water level is over the setpoint in P-control area
                if ((actualValue >= 6 && actualValue <= 7) && (actualValue >= setpoint)){
                    valveOpening = 0.5 + controllerMultiplier * diff;

                    if(valveOpening > 1){
                        valveOpening = 1;
                    };
                    if(valveOpening < 0){
                        valveOpening = 0;
                    };
                    var payload = [];
                    payload.push({
                        objectId: coerceId('ns=1;i=1000'),
                        methodId: coerceId("ns=1;i=1001"),
                        inputArguments: [{
                            dataType: opcua.DataType.Float,
                            arrayType: opcua.VariantArrayType.Scalar,
                            value: valveOpening}
                        ]
                    });
                    tank1.call(payload,function (err, result) {
                        //console.log(err)
                        //console.log(result)
                    });
                };

                //if level below 6, the P-control is put off and valve is set to be closed
                if(actualValue < 6){
                    valveOpening = 0;
                    var payload = [];
                    payload.push({
                        objectId: coerceId('ns=1;i=1000'),
                        methodId: coerceId("ns=1;i=1001"),
                        inputArguments: [{
                            dataType: opcua.DataType.Float,
                            arrayType: opcua.VariantArrayType.Scalar,
                            value: valveOpening}
                        ]
                    });
                    tank1.call(payload,function (err, result) {
                        //console.log(err)
                        //console.log(result)
                    });
                }

                // if level over 7 the P-control is put off and valve is set to be full open
                if(actualValue > 7) {
                    valveOpening = 1;
                    var payload = [];
                    payload.push({
                        objectId: coerceId('ns=1;i=1000'),
                        methodId: coerceId("ns=1;i=1001"),
                        inputArguments: [{
                            dataType: opcua.DataType.Float,
                            arrayType: opcua.VariantArrayType.Scalar,
                            value: valveOpening
                        }]
                    });
                    tank1.call(payload,function (err, result) {
                        //console.log(err)
                        //console.log(result)
                    });
                }
            });

            // valve value requesting from server

            var monitoredItem  = the_subscription.monitor({
                    nodeId: opcua.resolveNodeId('ns=1;s=valv'),
                    attributeId: opcua.AttributeIds.Value
                },
                {
                    samplingInterval: 10,
                    discardOldest: true,
                    queueSize: 10
                },
                opcua.read_service.TimestampsToReturn.Both
            );
            monitoredItem.on("changed",function(dataValue){
                var valveValue = dataValue.value.value;
                console.log("valvepos ", valveValue);
            });

//level trend requesting from server

            var monitoredItem  = the_subscription.monitor({
                    nodeId: opcua.resolveNodeId(coerceId('ns=1;i=1008')),
                    attributeId: opcua.AttributeIds.Value
                },
                {
                    samplingInterval: 10,
                    discardOldest: true,
                    queueSize: 10
                },
                opcua.read_service.TimestampsToReturn.Both
            );
            monitoredItem.on("changed",function(dataValue){
                var levelTrend = dataValue.value.value;
                console.log("levelTrend ", levelTrend);
            });

//valve trend requesting from server

            var monitoredItem  = the_subscription.monitor({
                    nodeId: opcua.resolveNodeId(coerceId('ns=1;i=1011')),
                    attributeId: opcua.AttributeIds.Value
                },
                {
                    samplingInterval: 10,
                    discardOldest: true,
                    queueSize: 10
                },
                opcua.read_service.TimestampsToReturn.Both
            );
            monitoredItem.on("changed",function(dataValue){
                var valveTrend = dataValue.value.value;
                console.log("valveTrend ", valveTrend);
            });
        },
    ],
);