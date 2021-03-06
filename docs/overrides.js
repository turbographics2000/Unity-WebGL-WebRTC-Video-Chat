var consoleLog = false;
const extensionId = 'ophefhhmblpnpplgcaeihbobllolhpnl';
const remoteMaxCount = 1;

// UnityLoader.jsでブラウザーの判定を行っているが、Edgeは'Chrome'と判定されてしまっている。
var browserType = window.chrome ? 'Chrome' :
              window.StyleMedia ? 'Edge' :
              window.InstallTrigger ? 'Firefox' :
              window.safari ? 'Safari' : 
              'Unsupported Browser';     

function override_enumerateMediaDevices() {
    if(!navigator.mediaDevices) return;
    navigator.mediaDevices.getDisplayMedia = navigator.mediaDevices.getDisplayMedia || 
                                             navigator.mediaDevices.webkitGetDisplayMedia ||
                                             navigator.mediaDevices.mozGetDisplayMedia ||
                                             navigator.mediaDevices.msGetDisplayMedia;

    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            // リモートのストリーム選択用にダミーのデバイス追加
            for(var i = 0; i < remoteMaxCount; i++) {
                MediaDevices.push({
                    deviceName: 'remote #' + i,
                })
            }
            devices.forEach(device => {
                if(device.kind === 'videoinput'){
                    MediaDevices.push({
                        deviceName: device.label || 'device #' + MediaDevices.length,
                        refCount: 0,
                        deviceId: device.deviceId,
                        video: null
                    });
                }
            });

            if(navigator.mediaDevices.getDisplayMedia) {
                // 策定中の仕様をとりあえず眺めて仮に実装したもの。まだどのブラウザーにおいてもScreen Capture APIは実装されていない。
                ['Application', 'Browser', 'Monitor', 'Window'].forEach(deviceName => {
                    MediaDevices.push({
                        deviceName: deviceName,
                        apiType: 'ScreenCaptureAPI',
                        refCount: 0,
                        deviceId: null,
                        video: false
                    });
                });
            } else if(browserType === 'Chrome') {
                chrome.runtime.sendMessage(extensionId, 'installCheck', result => {
                    if(!result) return;
                    MediaDevices.push({
                        deviceName: 'Screen Window ChromeTab',
                        apiType: 'Chrome',
                        refCount: 0,
                        deviceId: null,
                        video: false
                    });
                });
            } else if(browserType === 'Firefox' && window.ScreenShareExtentionExists) {
                ['Application', 'Screen', 'Window'].forEach(deviceName => {
                    MediaDevices.push({
                        deviceName: deviceName,
                        apiType: 'Firefox',
                        refCount: 0,
                        deviceId: null,
                        video: false
                    });
                })
            } else if(browserType === 'Edge') {
                // TODO
            } else if(browserType === 'Safari') {
                // TODO
            }

            // deviceNameがC#にわたると23文字 + 1文字 = 24文字で切られ、最後の文字は化けるというバグがあり、そのバグ回避
            var shortNames = {};
            MediaDevices.forEach(device => {
                var deviceName = device.deviceName || 'device #';
                if(deviceName.length > 23) {
                    var shortName = deviceName.substr(0, 20) + '...';
                    shortNames[shortName] = shortNames[shortName] || [];
                    shortNames[shortName].push(device);
                    device.deviceName = shortName;
                }            
            });
            for(var shortName in shortNames) {
                if(shortNames[shortName].length > 1) {
                    var lastIndex = shortNames[shortName].length - 1;
                    var idxLength = lastIndex.toString().length;
                    var newShortName = shortName.substr(0, 23 - idxLength - 4);
                    shortNames[shortName].forEach((device, idx) => {
                        device.deviceName = newShortName + '...#' + ('000' + idx).slice(-idxLength); 
                    });
                } 
            }
        })
        .catch(function(err){
            console.log(err.name + ':  ' + err.message);
        });
}

function override_JS_WebCamVideo_GetNativeWidth(deviceIndex) {
    consoleLog && console.log('_JS_WebCamVideo_GetNativeWidth', deviceIndex);
    return MediaDevices[deviceIndex].video ? MediaDevices[deviceIndex].video.videoWidth : 0;
}

function override_JS_WebCamVideo_GetNativeHeight(deviceIndex) {
    consoleLog && console.log('_JS_WebCamVideo_GetNativeWidth', deviceIndex);
    return MediaDevices[deviceIndex].video ? MediaDevices[deviceIndex].video.videoHeight : 0;
}

function override_JS_WebCamVideo_GrabFrame(deviceIndex, buffer, destWidth, destHeight) {
    consoleLog && console.log('_JS_WebCamVideo_GrabFrame', deviceIndex, buffer, destWidth, destHeight);
    if(!MediaDevices[deviceIndex].video) {
        console.error('WebCam not initialized.');
        return;
    }
    var context = webcam.canvas.getContext('2d');
    if(context) {
        canvas.width = destWidth;
        canvas.height = destHeight;
        var video = MediaDevices[deviceIndex].video;
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, destWidth, destHeight);
        var imageData = context.getImageData(0, 0, destWidth, destHeight);
        writeArrayToMemory(imageData.data, buffer);
    } else {
        console.log('2d Context is null');
    }
}

function override_JS_WebCamVideo_CanPlay(deviceIndex) {
    consoleLog && console.log('_JS_WebCamVideo_CanPlay', deviceIndex);
    return MediaDevices[deviceIndex].video && MediaDevices[deviceIndex].video.videoWidth > 0 && MediaDevices[deviceIndex].video.videoHeight > 0;
}

function override_JS_WebCamVideo_GetNumDevices() {
    consoleLog && console.log('_JS_WebCamVideo_GetNumDevices');
    return MediaDevices.length;
}

function override_JS_WebCamVideo_GetDeviceName(deviceIndex, buffer) {
    consoleLog && console.log('_JS_WebCamVideo_GetDeviceName', deviceIndex, buffer);
    if(buffer) writeStringToMemory(MediaDevices[deviceIndex].deviceName, buffer, false);
    return MediaDevices[deviceIndex].length;
}

function override_JS_WebCam_IsSupported() {
    consoleLog && console.log('_JS_WebCam_IsSupported');
    return !!navigator.mediaDevices.getUserMedia;
}

function override_JS_WebCamVideo_Stop(deviceIndex) {
    consoleLog && console.log('_JS_WebCamVideo_Stop', deviceIndex);
    var device = MediaDevices[deviceIndex];
    if(!device.video) {
        console.error('WebCam not initialized.');
        return;
    }
    if(--device.refCount === 0) {
        var stream = device.video.srcObject;
        var streamTracks = stream.getTracks();
        for(var streamTrack of streamTracks) {
            streamTrack.stop();
        }
        device.video.srcObject = null;
        webcam.canvas.removeChild(device.video);
        device.video = null;
    }
}

function override_JS_WebCamVideo_Start(deviceIndex) {
    consoleLog && console.log('_JS_WebCamVideo_Start', deviceIndex);
    var device = MediaDevices[deviceIndex];
    if(device.deviceName === 'screen') {
        override_JS_WebCamVideo_Stop(deviceIndex);
    }
    if(device.video) {
        device.refCount++;
        return;
    }
    if(!navigator.mediaDevices.getUserMedia) {
        console.log('WebCam is not supported. Try a different browser.');
        return;
    }
    if(!webcam.canvas) {
        canvas = document.createElement('canvas');
        canvas.style.display = 'none';
        var context2d = canvas.getContext('2d');
        if(!context2d){
            console.log('context2d is null');
            return;
        }
        //document.body.appendChild(canvas);
        webcam.canvas = canvas;
    }
    var video = document.createElement('video');
    var constraints = null;
    var p = null;
    if(['Application', 'Browser', 'Monitor', 'Window'].includes(device.deviceName) && device.apiType === 'ScreenCaptureAPI') {
        p = Promise.resolve({ 
            type: 'ScreenCaptureAPI'
        });
    } else if(device.deviceName === 'Screen Window ChromeTab') {
        var getScreenStreamId = function() {
            return new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(extensionId, 'getScreenStreamId', streamId => {
                    if(streamId){
                        resolve({
                            type: 'ChromeScreenShare', 
                            streamId: streamId
                        });
                    } else {
                        reject('Get streamId error.');
                    }
                });
            }); 
        }
        p = getScreenStreamId();
    } else if(['Screen', 'Window', 'Application'].includes(device.deviceName) && device.apiType === 'Firefox') {
        p = Promise.resolve({ 
            type: 'FirefoxScreenShare'
        });
    } else {
        p = Promise.resolve({ 
            type: 'WebCam'
        });
    }
    p.then(captureType => {
            if(captureType === 'ScreenCaptureAPI') {
                return {
                    video: {
                        displaySurface: device.devicename.toLowerCase()
                        // logicalSurface: false
                    }
                }
            } else if(captureType.type === 'ChromeScreenShare') {
                return {
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: captureType.streamId
                            //maxWidth: 1920,
                            //maxHeight: 1080
                        }
                    },
                    audio: false
                };
            } else if(captureType.type === 'FirefoxScreenShare') {
                return {
                    video: {
                        mediaSource: device.deviceName.toLowerCase()
                    },
                    audio: false
                }
            } else {
                return {
                    video: {
                        deviceId: device.deviceId
                    }, 
                    audio: false
                };
            }
        })
        .then(constraints => {
            if(device.captureType === 'ScreenCaptureAPI') {
                return navigator.MediaDevices.getDisplayMedia(constraints);
            } else {
                return navigator.mediaDevices.getUserMedia(constraints);
            }
        })
        .then(stream => {
            video.srcObject = stream;
            webcam.canvas.appendChild(video);
            video.play();
            device.video = video;
            device.refCount++;
        })
        .catch(err => {
            console.log('An error occured! ' + err);
        });
}


Array.prototype.push = (function(){
    var original = Array.prototype.push;
    return function() {
        for(var i = 0; i < arguments.length; i++) {
            if(typeof arguments[i] === 'function' && arguments[i].toString().includes('addDevice')) {
                arguments[i] = override_enumerateMediaDevices;
            }
        }
        return original.apply(this, arguments);
    };
})();

Object.defineProperties(Module, {
    _asmLibraryArg: {
        value: true,
        writable: true
    }
});

Object.defineProperty(Module, 'asmLibraryArg', {
    get: function () {
        return this._asmLibraryArg;
    },
    set: function(val) {
        val._JS_WebCamVideo_GetNativeWidth = override_JS_WebCamVideo_GetNativeWidth;
        val._JS_WebCamVideo_GetNativeHeight = override_JS_WebCamVideo_GetNativeHeight;
        val._JS_WebCamVideo_GrabFrame = override_JS_WebCamVideo_GrabFrame;
        val._JS_WebCamVideo_CanPlay = override_JS_WebCamVideo_CanPlay;
        val._JS_WebCamVideo_GetNumDevices = override_JS_WebCamVideo_GetNumDevices;
        val._JS_WebCamVideo_GetDeviceName = override_JS_WebCamVideo_GetDeviceName;
        val._JS_WebCam_IsSupported = override_JS_WebCam_IsSupported;
        val._JS_WebCamVideo_Stop = override_JS_WebCamVideo_Stop;
        val._JS_WebCamVideo_Start = override_JS_WebCamVideo_Start;
        this._asmLibraryArg = val;
    }
});
