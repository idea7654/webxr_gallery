import * as THREE from 'https://unpkg.com/three/build/three.module.js';
import {
    GLTFLoader
} from 'https://unpkg.com/three/examples/jsm/loaders/GLTFLoader.js';
import {
    ColladaLoader
} from 'https://threejs.org/examples/jsm/loaders/ColladaLoader.js';

let renderer = null;
let scene = null;
let camera = null;
let model = null;
let mixer = null;
let action = null;
let reticle = null;
let lastFrame = Date.now();
let mesh = null;
let video = null;
let flag = false;
let arrowModel = null;
let monariza = null;
let fakeM = null;
const scale = 0.012;
let count = 0;
let countflag = false;

const initScene = (gl, session) => {
    //-- scene, camera
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    //---
    //--- igloo model
    const loader = new ColladaLoader();
    loader.load('model.dae', (collada) => {
        model = new THREE.Object3D();
        collada.scene.scale.set(scale, scale, scale * 1.5);
        collada.scene.rotateZ(-90 * Math.PI / 180);
        model.add(collada.scene);

        fakeM = new THREE.Object3D();
        fakeM.position.set(-1, 1.24, 0);
        model.add(fakeM);
    });
    //---

    //--- monariza
    const texLoader = new THREE.TextureLoader();
    const Montexture = texLoader.load('monariza.jpg');
    const Mongeometry = new THREE.PlaneBufferGeometry(0.3, 0.4, 1);
    const Monmaterial = new THREE.MeshBasicMaterial({
        map: Montexture
    });
    monariza = new THREE.Mesh(Mongeometry, Monmaterial);
    monariza.scale.set(1, 1, 1);
    //monariza.rotateZ(90 * Math.PI / 180);
    monariza.rotateY(90 * Math.PI / 180);
    //monariza.position.set(-1, 1.24, 0);
    //model.add(monariza);
    //---

    //--- video object
    video = document.getElementById('video');

    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    texture.format = THREE.RGBFormat;
    const geometry = new THREE.PlaneBufferGeometry(0.8, 0.45, 1);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
    });

    mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(1, 0.5, 1);
    //---

    //--- arrow object
    loader.load('model 2.dae', (collada) => {
        arrowModel = new THREE.Object3D();
        collada.scene.scale.set(0.3, 0.3, 0.3);
        collada.scene.rotateZ(180 * Math.PI / 180);

        arrowModel.add(collada.scene);
    });
    //---

    //--- light
    const light = new THREE.PointLight(0xffffff, 2, 100); // soft white light
    light.position.z = 1;
    light.position.y = 5;
    scene.add(light);
    //---
    // create and configure three.js renderer with XR support
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        autoClear: true,
        context: gl,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    renderer.xr.setSession(session);
    document.body.appendChild(renderer.domElement);
    //---
    // simple sprite to indicate detected surfaces
    reticle = new THREE.Mesh(
        new THREE.RingBufferGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshPhongMaterial({
            color: 0x0fff00
        })
    );
    //---
    // we will update it's matrix later using WebXR hit test pose matrix
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    //---
};

// button to start XR experience
const xrButton = document.getElementById('xr-button');
// to display debug information
const info = document.getElementById('info');
// to control the xr session
let xrSession = null;
// reference space used within an application https://developer.mozilla.org/en-US/docs/Web/API/XRSession/requestReferenceSpace
let xrRefSpace = null;
// for hit testing with detected surfaces
let xrHitTestSource = null;

// Canvas OpenGL context used for rendering
let gl = null;

function checkXR() {
    if (!window.isSecureContext) {
        document.getElementById("warning").innerText = "WebXR unavailable. Please use secure context";
    }
    if (navigator.xr) {
        navigator.xr.addEventListener('devicechange', checkSupportedState);
        checkSupportedState();
    } else {
        document.getElementById("warning").innerText = "WebXR unavailable for this browser";
    }
}

function checkSupportedState() {
    navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
        if (supported) {
            xrButton.innerHTML = 'Enter AR';
            xrButton.addEventListener('click', onButtonClicked);
        } else {
            xrButton.innerHTML = 'AR not found';
        }
        xrButton.disabled = !supported;
    });
}

function onButtonClicked() {
    if (!xrSession) {
        navigator.xr.requestSession('immersive-ar', {
            optionalFeatures: ['dom-overlay'],
            requiredFeatures: ['local', 'hit-test'],
            domOverlay: {
                root: document.getElementById('overlay')
            }
        }).then(onSessionStarted, onRequestSessionError);
    } else {
        xrSession.end();
    }
}

function handleOrientation(event) {
    const absolute = event.absolute;
    const z = event.alpha;
    const x = event.beta;
    const y = event.gamma;

    //console.log(absolute, x, y, z);
}

function onSessionStarted(session) {
    xrSession = session;
    xrButton.innerHTML = 'Exit AR';
    window.addEventListener('deviceorientation', handleOrientation, true);
    // Show which type of DOM Overlay got enabled (if any)
    if (session.domOverlayState) {
        info.innerHTML = 'DOM Overlay type: ' + session.domOverlayState.type;
        document.getElementById('warn').innerHTML = '携帯を動かしてください';
    }

    // create a canvas element and WebGL context for rendering
    session.addEventListener('end', onSessionEnded);
    let canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl', {
        xrCompatible: true
    });
    session.updateRenderState({
        baseLayer: new XRWebGLLayer(session, gl)
    });

    // here we ask for viewer reference space, since we will be casting a ray
    // from a viewer towards a detected surface. The results of ray and surface intersection
    // will be obtained via xrHitTestSource variable
    session.requestReferenceSpace('viewer').then((refSpace) => {
        session.requestHitTestSource({
            space: refSpace
        }).then((hitTestSource) => {
            xrHitTestSource = hitTestSource;
        });
    });

    session.requestReferenceSpace('local').then((refSpace) => {
        xrRefSpace = refSpace;
        session.requestAnimationFrame(onXRFrame);
    });

    document.getElementById("overlay").addEventListener('click', placeObject);

    // initialize three.js scene
    initScene(gl, session);
}

function onRequestSessionError(ex) {
    info.innerHTML = "Failed to start AR session.";
    console.error(ex.message);
}

function onSessionEnded(event) {
    xrSession = null;
    xrButton.innerHTML = 'Enter AR';
    info.innerHTML = '';
    gl = null;
    if (xrHitTestSource) xrHitTestSource.cancel();
    xrHitTestSource = null;
}

function placeObject() {
    if (reticle.visible && model && flag && arrowModel) {
        const pos = reticle.getWorldPosition();
        const distance = pos.distanceTo(new THREE.Vector3(0, 0, 0));

        mesh.name = "サンプル動画";
        monariza.name = "monariza";

        reticle.visible = false;
        xrHitTestSource.cancel();
        xrHitTestSource = null;
        document.getElementById('warn').innerHTML = '';
        // we'll be placing our object right where the reticle was

        scene.remove(reticle);
        model.position.set(pos.x, pos.y, pos.z);
        scene.add(model);
        mesh.position.set(pos.x, 1.24, pos.z + pos.z / 5);
        scene.add(mesh);
        arrowModel.position.set(pos.x, pos.y, pos.z / 2);
        scene.add(arrowModel);
        video.play();
        const childPos = fakeM.getWorldPosition();
        monariza.position.set(childPos.x, childPos.y, childPos.z);
        scene.add(monariza);

        // start object animation right away
        //toggleAnimation();
        // instead of placing an object we will just toggle animation state
        document.getElementById("overlay").removeEventListener('click', placeObject);
        document.getElementById("overlay").addEventListener('touchstart', touchObj);
    }
}

function touchObj(event) {
    //터치 판정
    event.preventDefault();
    const x = (event.targetTouches[0].pageX / window.innerWidth) * 2 + -1;
    const y = -(event.targetTouches[0].pageY / window.innerHeight) * 2 + 1;

    const vector = new THREE.Vector2(x, y);
    const raycast = new THREE.Raycaster();

    raycast.setFromCamera(vector, camera);
    const intersects = raycast.intersectObjects(scene.children);

    const div = document.getElementById('artInfo');
    if (intersects.length !== 0) {
        if (intersects[0].object.name) {
            div.style.visibility = "visible";
            div.innerHTML = `作品情報：${intersects[0].object.name}`;
        }
    } else {
        div.style.visibility = "hidden";
    }
}

// Utility function to update animated objects
function updateAnimation() {
    const warn = document.getElementById('warn');
    if (reticle.visible && model) {
        const pos = reticle.getWorldPosition();
        const distance = pos.distanceTo(new THREE.Vector3(0, 0, 0));
        if (distance < 3) {
            reticle.material.color.setHex(0xff0000);
            warn.innerHTML = '距離が足りません。もっと遠くから設置してください。';
            flag = false;
        } else {
            reticle.material.color.setHex(0x0fff00);
            warn.innerHTML = 'タップしてください。';
            flag = true;
        }
    }
    if (arrowModel) {
        if (count < 10 && !countflag) {
            arrowModel.position.y += 0.01;
            count++;
        }
        if (count === 10 || count === 0) {
            countflag = !countflag;
        }
        if (count >= 0 && countflag) {
            arrowModel.position.y -= 0.01;
            count--;
        }
    }
}

function onXRFrame(t, frame) {
    let session = frame.session;
    session.requestAnimationFrame(onXRFrame);
    if (xrHitTestSource) {
        // obtain hit test results by casting a ray from the center of device screen
        // into AR view. Results indicate that ray intersected with one or more detected surfaces
        const hitTestResults = frame.getHitTestResults(xrHitTestSource);
        if (hitTestResults.length) {
            // obtain a local pose at the intersection point
            const pose = hitTestResults[0].getPose(xrRefSpace);
            // place a reticle at the intersection point
            reticle.matrix.fromArray(pose.transform.matrix);
            reticle.visible = true;
        }
    } else { // do not show a reticle if no surfaces are intersected
        reticle.visible = false;
    }

    // update object animation
    updateAnimation();
    // bind our gl context that was created with WebXR to threejs renderer
    gl.bindFramebuffer(gl.FRAMEBUFFER, session.renderState.baseLayer.framebuffer);
    // render the scene
    renderer.render(scene, camera);
}

checkXR();
