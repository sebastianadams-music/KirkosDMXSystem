sketch.default2d();
outlets = 2

// Get the width and height of the JSUI object
var width = box.rect[2] - box.rect[0];
var height = box.rect[3] - box.rect[1];

// radius of light circles
var radius = .1
var birdieRadius = .075
var smartRadius = .033
var lightTubeLength = 1.1

var vbrgb = [.7,.7,.7,.8]; //bgcolor
last_x = 0
last_y = 0
var d = new Dict("lxtest"); // dictionary of all lights
var lxState = new Dict("lxstate"); // dictionary of DMX light state
var lockState = new Dict("lockState") 
var smartState = new Dict("lightCmd"); // diction+ary of Smart Light state

var lightArray = []
var activeLight = 0

// var lxtest = JSON.parse(d.stringify())
// var keys = Object.entries(lxtest); // could also use dict's getkeys method
// var vbrgb = [0.,0.,0.,1.];
draw()
drawSmartLight(1, 1, 1, "antela1", 1)

refresh()



function draw() {
    with (sketch) {
        glclearcolor(vbrgb[0],vbrgb[1],vbrgb[2],vbrgb[3]);
        glclear();
        var keys = d.getkeys()
        lightArray = []
        for (var i = 0; i < keys.length; i++) {
            // format dict parameters
            var type = d.get((i + 1) + "::type")
            var positionX = d.get((i + 1) + "::positionX")
            var positionY = d.get((i + 1) + "::positionY")
            var startingAddress = d.get((i + 1) + "::startingAddress")
            var lightGroup = d.get((i + 1) + "::lightGroup")
            if (type == "RGBW"){
                drawRGBWPar((i + 1), positionX, positionY, startingAddress, lightGroup)
            } 
            if (type == "birdie"){
                drawBirdie((i + 1), positionX, positionY, startingAddress, lightGroup)
            }
            if (type == "tube"){
                drawLightTube((i + 1), positionX, positionY, startingAddress, lightGroup)
            }
            if (type == "smart"){
                drawSmartLight((i + 1), positionX, positionY, startingAddress, lightGroup) // note that the startingAddress will contain the entity name, not the address
            }
            lightArray.push([positionX, positionY])
        }
        outlet(1, JSON.stringify(lightArray))
    }

}

function bang(){
    draw()
    refresh()
}

function onclick(x,y,but,cmd,shift,capslock,option,ctrl)
{
	// cache mouse position for tracking delta movements
	last_x = x;
	last_y = y;
    var keys = d.getkeys()
        for (var i = 0; i < keys.length; i++) {
        }
    var mouseNorm = normCoords(x, y, width, height)

    for (var i = 0; i < lightArray.length; i++) {
        var center = lightArray[i];
        var dist = distance(center[0], center[1], mouseNorm[0], mouseNorm[1]);
        
        // If distance to center is less than or equal to radius, mouse is on top of circle
        if (dist <= radius) {
            // post("Mouse is on top of circle " + (i + 1) + "\n");
            activeLight = (i + 1)
            bang()
        }
    }
    
    
    
     outlet(0, activeLight)
}

function ondrag(x,y,but)
{
    if (but == 0) {
        return
        // if no button is pressed while dragging, the rest of the ondrag function is not called (this stops the object moving on a new click!)
    }

    

    var keys = d.getkeys()
        for (var i = 0; i < keys.length; i++) {
        }
    

    // need to get the active light and move it to the new mouse position, then redraw
    dictContents = d.get(JSON.stringify(activeLight))

    var activeLightDict = new Dict()
    activeLightDict.set("type", dictContents.get("type"))

    if (lockState.get("lock") == 0) {
        var mouseNorm = normCoords(x, y, width, height)
        activeLightDict.set("positionX", mouseNorm[0])
        activeLightDict.set("positionY", mouseNorm[1])
    }   
    else {
        activeLightDict.set("positionX", dictContents.get("positionX"))
        activeLightDict.set("positionY", dictContents.get("positionY"))       
    }

    activeLightDict.set("startingAddress", dictContents.get("startingAddress"))
    activeLightDict.set("lightGroup", dictContents.get("lightGroup"))

    d.set(JSON.stringify(activeLight), activeLightDict)

    bang()

}

function drawRGBWPar(lxNum, posX, posY, startingAddress, lightGroup){
    with (sketch) {
        // grab lx values from dictionary
        var R = lxState.get(startingAddress)/255
        var G = lxState.get(startingAddress + 1)/255
        var B = lxState.get(startingAddress + 2)/255
        var W = lxState.get(startingAddress + 3)/255
        
        // draw light
        moveto(posX, posY) 
        if (activeLight == lxNum){
            glcolor(0, 0, 0, 1)
            circle(radius * 1.15, 0, 360)
            glcolor(1, 1, 1, 1)
            circle(radius * 1.075, 0, 360)

        } 
        glcolor(R, G, B, 1)
        circle(radius, 0, 360)
        glcolor(W, W, W, W)
        circle(radius/2, 0, 360)
        glcolor(0, 0, 0, 1)
        moveto(posX + .75*radius, posY + 1.25*radius)
        text("ID: " + lxNum);
        moveto(posX + radius*.75, posY + radius*.75)
        glcolor(0, 0, 0, 1)
        
        // font(myfont);
		// fontsize(myfontsize*height);
		// textalign("center","center");		
		text("add: " + startingAddress);
        moveto(posX + 1*radius, posY + .25*radius)
        text("group: " + lightGroup);

    }
}

function drawSmartLight(lxNum, posX, posY, entityName, lightGroup) {
    try {
        var lights = smartState.get("lights");
        if (!lights) {
            // post("No lights key found in smartState\n");
            return;
        }
        
        // --- FIX: Correctly find the light entity ---
var foundLight = null;
for (var i = 0; i < lights.length; i++) {
    var lightDict = lights[i];
    if (lightDict && typeof lightDict.get === "function" && lightDict.get("entity") === entityName) {
        foundLight = lightDict;
        break; // Stop searching once found!
    }
}

        if (!foundLight) {
            // post("No light found for entity: " + entityName + "\n");
            return;
        }
        
        // ... (rest of the drawing logic remains the same) ...
        
        // Note: The original code's drawing logic after this point seems to have some redundant `foundLight` checks 
        // and inconsistent use of parseInt, but they aren't the primary issue right now.
        // The primary issue was finding the light.
        // end of code to find specific light
        if (foundLight.get("rgb_color")){
                  // To get rgb_color array from foundLight:
            var rgb_color = foundLight.get("rgb_color");
            // post("Found light for entity " + entityName + ", rgb_color: " + JSON.stringify(rgb_color) + "\n");
            var brightness = parseInt(foundLight.get("brightness"))/255;
            // draw light
            var R = parseInt(rgb_color[0])/255*brightness;
            var G = parseInt(rgb_color[1])/255*brightness;
            var B = parseInt(rgb_color[2])/255*brightness;
            // post("RGB: ", R, G, B)
        }
        else {
            // post("no_rgb")
            var kelvin = foundLight.get("color_temp_kelvin");
            // post("Found light for entity " + entityName + ", kelvin: " + JSON.stringify(kelvin) + "\n");
            var brightness = parseInt(foundLight.get("brightness"))/255;
            // draw light
            // post("rgb", kelvin)
            var rgb_color = colorTemperatureToRGB(kelvin)
            // post("rgb from kevlin", rgb_color, "\n")
            var R = parseInt(rgb_color[0])/255;
            var G = parseInt(rgb_color[1])/255;
            var B = parseInt(rgb_color[2])/255;
            // post("RGB: ", R, G, B)
        }

       

        with (sketch) {
       
        moveto(posX, posY) 
        if (activeLight == lxNum){
            glcolor(0, 0, 0, 1)
            circle(smartRadius * 1.15, 0, 360)
            glcolor(1, 1, 1, 1)
            circle(smartRadius * 1.075, 0, 360)

        } 
        // opaque background
        glcolor(0.2, 0.2, 0.2, 1)
        circle(smartRadius, 0, 360)

        glcolor(R, G, B, brightness)
        
      
        circle(smartRadius, 0, 360)
        // glcolor(W, W, W, W)
        // circle(radius/2, 0, 360)
        glcolor(0, 0, 0, 1)
        moveto(posX + .85*smartRadius, posY + 1.45*smartRadius)
        text("ID: " + lxNum);
        moveto(posX + smartRadius*1.1, posY + smartRadius*.25)
        glcolor(0, 0, 0, 1)
        
        // font(myfont);
		// fontsize(myfontsize*height);
		// textalign("center","center");		
		text("add: " + entityName);
        moveto(posX + 1.1*smartRadius, posY + -1*smartRadius)
        text("group: " + lightGroup);
        }


 

    } catch (err) {
        post("Error in drawSmartLight: " + err.message + "\n");
    }
}


function drawBirdie(lxNum, posX, posY, startingAddress, lightGroup){
    with (sketch) {
        // grab lx values from dictionary
        var W = lxState.get(startingAddress)/50
        
        // draw light
        moveto(posX, posY) 
        if (activeLight == lxNum){
            glcolor(0, 0, 0, 1)
            circle(birdieRadius * 1.15, 0, 360)
            glcolor(1, 1, 1, 1)
            circle(birdieRadius * 1.075, 0, 360)

        } 
        glcolor(W, W, W, 1)
        circle(birdieRadius, 0, 360)

        glcolor(0, 0, 0, 1)
        moveto(posX + birdieRadius, posY + 1.75*birdieRadius)
        text("ID: " + lxNum);		
        moveto(posX + birdieRadius, posY + birdieRadius)
        
        // font(myfont);
		// fontsize(myfontsize*height);
		// textalign("center","center");		
		text("add: " + startingAddress);
		// text("add: " + startingAddress);
        moveto(posX + 1*radius, posY + .25*radius)
        text("group: " + lightGroup);
        

    }
}


function drawLightTube(lxNum, posX, posY, startingAddress, lightGroup){
    var lTRad = lightTubeLength/96 
    with (sketch) {
        // grab lx values from dictionary
        var lightTubeState = getLightTubeState(lxState, startingAddress)
        // post(lightTubeState[0])
        
        // draw light
        moveto(posX, posY) 
        if (activeLight == lxNum){
           // draw black frame around light tube
            glcolor(0, 0, 0, 1)
            glrect(posX - 1.33*lTRad, posY + 1.33*lTRad, posX + (lightTubeLength/3.14) + 1.33*lTRad, posY - 1.33*lTRad)
            // draw smaller white frame around light tube
             glcolor(1, 1, 1, 1)
            glrect(posX - 1.1*lTRad, posY + 1.1*lTRad, posX + (lightTubeLength/3.14) + 1.1*lTRad, posY - 1.1*lTRad)
            // circle(radius * 1.15, 0, 360)

        } 
        for (var i = 0; i < 16; i++){
            glcolor(lightTubeState[3*i], lightTubeState[(3*i) + 1], lightTubeState[(3*i) + 2], 1)
            circle(lTRad, 0, 360)
            moveto((posX + (i + 1)*(2*lTRad)), posY) 
        }
        moveto(posX + 32*lTRad, posY + radius*.75)
        glcolor(0, 0, 0, 1)
        text("ID: " + lxNum);		
        moveto(posX + 32*lTRad, posY + radius*.25)
        
        // font(myfont);
		// fontsize(myfontsize*height);
		// textalign("center","center");
		text("add: " + startingAddress);
		text("add: " + startingAddress);
        moveto(posX + 1*radius, posY + .25*radius)
        text("group: " + lightGroup);

        

    }
}


function getLightTubeState(lxState, startingAddress){
    var arr = []
    for (var i = 0; i < 48; i++){
        var currentPixel = lxState.get(startingAddress + i)/255
        arr.push(currentPixel)
    }
    return arr
}



function normCoords(mouseX, mouseY, viewportWidth, viewportHeight){
    // Calculate normalized coordinates
var normalizedX = (mouseX / viewportWidth) * 2 - 1;
var normalizedY = ((viewportHeight - mouseY) / viewportHeight) * 2 - 1;


// Output normalized coordinates
// post("Normalized X: " + normalizedX + "\n");
// post("Normalized Y: " + normalizedY + "\n");

return [normalizedX, normalizedY]
}

function distance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}


// test functions

function randomBetween(min, max) {
    n = (Math.random() * (max - min) + min);
    return n
}
function randomRGB(){
    var r = Math.random()
    var g = Math.random()
    var b = Math.random()
    var arr = [r, g, b]
    return arr
}

function randomXY(){
    var x = randomBetween(-.8, .8)
    var y = randomBetween(-.8, .8)
    var arr = [x, y]
    return arr
}


function randomLights(){
    // draw random lights 
    for (var i = 0; i < 5; i++) {
        with (sketch){
            var rgb = randomRGB()
            var xy = randomXY()
            var w = Math.random()
            drawRGBWPar(xy[0], xy[1], rgb[0], rgb[1], rgb[2], w) // position of centre X Y, R G B W value	        
        }

    }
}


// From http://www.tannerhelland.com/4435/convert-temperature-rgb-algorithm-code/

    // Start with a temperature, in Kelvin, somewhere between 1000 and 40000.  (Other values may work,
    //  but I can't make any promises about the quality of the algorithm's estimates above 40000 K.)

    
function colorTemperatureToRGB(kelvin){

    // post("cTemp", kelvin, "cTe,[t")

    var temp = kelvin / 100;

    var red, green, blue;

    if( temp <= 66 ){ 

        red = 255; 
        
        green = temp;
        green = 99.4708025861 * Math.log(green) - 161.1195681661;

        
        if( temp <= 19){

            blue = 0;

        } else {

            blue = temp-10;
            blue = 138.5177312231 * Math.log(blue) - 305.0447927307;

        }

    } else {

        red = temp - 60;
        red = 329.698727446 * Math.pow(red, -0.1332047592);
        
        green = temp - 60;
        green = 288.1221695283 * Math.pow(green, -0.0755148492 );

        blue = 255;

    }

    // post("--", red, green, blue, "---")
    var rgb = [clamp(red, 0, 255), clamp(green, 0, 255), clamp(blue, 0, 255)]

    return rgb

    // return {
    //     r : clamp(red,   0, 255),
    //     g : clamp(green, 0, 255),
    //     b : clamp(blue,  0, 255)
    // }

}


function clamp( x, min, max ) {

    if(x<min){ return min; }
    if(x>max){ return max; }

    return x;

}



function onkeydown(x) {
    if (x.shiftKey) {
        if (x.key === "c" || x.key === "C") {
            outlet(0, "copy");
        }
        if (x.key === "v" || x.key === "V") {
            outlet(0, "paste");
        }
    }
}
