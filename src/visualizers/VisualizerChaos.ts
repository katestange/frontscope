import p5 from "p5";
import { VisualizerDefault } from './VisualizerDefault';
import { VisualizerParamsSchema, VisualizerExportModule } from './VisualizerInterface';
import { ParamType } from '@/shared/ParamType';
import { ValidationStatus } from '@/shared/ValidationStatus';

// p5 Colour palette class
class Palette {
	colorList: p5.Color[] = [];
	backgroundColor: p5.Color;
	textColor: p5.Color;

	constructor( sketch: p5, hexList: string[]= [], hexBack = '#000000', hexText = '#FFFFFF' ) {
		this.colorList = hexList.map( colorSpec => sketch.color(colorSpec) );
		this.backgroundColor = sketch.color(hexBack);
		this.textColor = sketch.color(hexText);
	}
}

enum ColorStyle { Walker = 0, Corner, Index, Highlight }

// params schema
const schemaChaos = [
	new VisualizerParamsSchema(
		"offset",
		ParamType.number,
		"Starting index",
		true,
		0,
		"The index of the first term (if less than first valid term, will start at first valid term)."
	),
	new VisualizerParamsSchema(
		"num",
		ParamType.number,
		"Ending index",
		true,
		10000,
		"The index of the last term (a value of 0 will draw forever/until it runs out)."
	),
	new VisualizerParamsSchema(
		"corners",
		ParamType.number,
		"Number of corners",
		true,
		4,
		"The number of corners on the polygon, also the modulus we apply to the terms of the sequence."
	),
	new VisualizerParamsSchema(
		"walkers",
		ParamType.number,
		"Number of walkers",
		true,
		1,
		"The number w of walkers; break into subsequences based on residue mod w of the index, each with a separate walker."
	),
	// it would be nice to change this to an enum, if the params schema allowed
	new VisualizerParamsSchema(
		"style",
		ParamType.number,
		"Color scheme",
		true,
		1,
		"0 = colour by walker; 1 = colour by destination; 2 = colour by index; 3 = colour one walker."
	),
	new VisualizerParamsSchema(
		"highlightWalker",
		ParamType.number,
		"Highlighted walker",
		false,
		0,
		"The walker to highlight in colour scheme 3."
	),
	new VisualizerParamsSchema(
		"circSize",
		ParamType.number,
		"Circle size",
		true,
		1,
		"Size of the dots."
	),
	new VisualizerParamsSchema(
		"alpha",
		ParamType.number,
		"Circle alpha",
		true,
		1,
		"Alpha factor (transparency, 0=transparent, 1=solid) of the dots."
	),
	new VisualizerParamsSchema(
		"frac",
		ParamType.number,
		"Fraction to walk",
		true,
		0.5,
		"How far each step takes you toward the corner (value between 0 and 1 inclusive)."
	),
	new VisualizerParamsSchema(
		"pixelsPerFrame",
		ParamType.number,
		"Dots per frame",
		true,
		400,
		"How many dots to draw per frame (more = faster)."
	),
	new VisualizerParamsSchema(
		"showLabels",
		ParamType.boolean,
		"Show corner labels?",
		true,
		false,
		"Whether to label corners of polygon."
	),
	new VisualizerParamsSchema(
		"darkMode",
		ParamType.boolean,
		"Use dark mode?",
		true,
		false,
		"Whether to make a dark background."
	)
	];
	// other ideas:  previous parts of the sequence fade over time, or shrink over time
	// circles fade to the outside


class VisualizerChaos extends VisualizerDefault {
    
	name = "Chaos";
	params = schemaChaos;

	// private properly typed versions of the user parameters
	private offset = 0;
	private num = 0;
	private corners = 0;
	private walkers = 0;
	private colorStyle = ColorStyle.Walker;
	private highlightWalker = 0;
	private circSize = 0;
	private alpha = 1;
	private frac = 0;
	private pixelsPerFrame = 0;
	private showLabels = false;
	private darkMode = false;
	
	// current state variables (used in setup and draw)
	private myIndex = 0;
	private pixelCount = 0;
	private cornersList: p5.Vector[] = [];
	private walkerPositions: p5.Vector[] = [];

	// colour palette
	private currentPalette = new Palette(this.sketch);

	validate() {
		this.assignParams();
		this.isValid = false;

		// properly typed private versions of parameters
		this.offset = Number(this.settings.offset);
		this.num = Number(this.settings.num);
		this.corners = Number(this.settings.corners);
		this.walkers = Number(this.settings.walkers);
		const style = Number(this.settings.style);
		this.highlightWalker = Number(this.settings.highlightWalker);
		this.circSize = Number(this.settings.circSize);
		this.alpha = Number(this.settings.alpha);
		this.frac = Number(this.settings.frac);
		this.pixelsPerFrame = Number(this.settings.pixelsPerFrame);
		this.showLabels = Boolean(this.settings.showLabels);
		this.darkMode = Boolean(this.settings.darkMode);

		// validation checks
		const validationMessages: string[] = [];
		if (!Number.isInteger( this.offset ) || this.offset < 0) 
			validationMessages.push("The starting index must be a non-negative integer.");
		if (!Number.isInteger( this.num ) || this.num < 0) 
			validationMessages.push("The last index must be a non-negative integer.");
		if (!Number.isInteger( this.corners ) || this.corners < 2) 
			validationMessages.push("The number of corners must be an integer > 1.");
		if (!Number.isInteger( this.walkers ) || this.walkers < 1) 
			validationMessages.push("The number of walkers must be an integer > 0.");
		if (!Number.isInteger( style ) || style < 0 || style > 3) 
			validationMessages.push("The style must be an integer between 0 and 3 inclusive.");
		if (!Number.isInteger( this.highlightWalker ) || this.highlightWalker < 0 || this.highlightWalker >= this.walkers) 
			validationMessages.push("The highlighted walker must be an integer between 0 and the number of walkers minus 1.");
		if (this.circSize < 0) validationMessages.push("The circle size must be positive.");
		if (this.alpha < 0 || this.alpha > 1) validationMessages.push("The alpha must be between 0 and 1 inclusive.");
		if (this.frac < 0 || this.frac > 1) validationMessages.push("The fraction must be between 0 and 1 inclusive.");
		if (!Number.isInteger( this.pixelsPerFrame ) || this.pixelsPerFrame < 0 ) 
			validationMessages.push("The dots per frame must be a positive integer.");
		if (validationMessages.length > 0) 
			return new ValidationStatus(false, validationMessages );

		this.colorStyle = (<ColorStyle> style);

		this.isValid = true;
		return new ValidationStatus(true);
	}

	numModulus(a: ( number | bigint ), b: number) {
		// This should be replaced with the modulus function in our own library, once that exists
		if (b <= 0) { 
			throw new Error("negative modulus error");
		}
		const A = BigInt(a);
		const B = BigInt(b); 
		// the return value will always be a valid number, because b was a number
		if (A < 0n ){
			return Number( A % B + B );
		} else {
			return Number( A % B );
		}
	}

	chaosWindow( center: p5.Vector, radius: number) {
		// creates corners of a polygon with given centre and radius
		const pts: p5.Vector[] = [];
		for( let i = 0; i < this.corners; i++ ){
			const angle = this.sketch.radians( 45+360*i/this.corners );
			pts.push( this.sketch.createVector( 
				center.x + radius*this.sketch.cos(angle),
				center.y + radius*this.sketch.sin(angle)
			));
		}
		return pts;
	}

	setup() {

		super.setup();

		// decide which palette to set by default
		// we need a colourpicker in the params eventually
		// right now this is a little arbitrary
		const defaultColorList = [
			'#588dad', // blue greenish
			'#daa520', // orange 
			'#008a2c', // green
			'#ff6361', // fuschia
			'#ffa600', // bright orange
			'#bc5090', // lerp toward purple
			'#655ca3' // purple
		];
		const darkColor = '#262626';
		const lightColor = '#f5f5f5';
		if( this.darkMode ){ 
			this.currentPalette = new Palette(this.sketch,defaultColorList,darkColor,lightColor);
		} else {
			this.currentPalette = new Palette(this.sketch,defaultColorList,lightColor,darkColor);
		}
		if( 
			(this.colorStyle === ColorStyle.Walker && this.walkers > 7) 
			|| ( this.colorStyle === ColorStyle.Corner && this.corners > 7 ) 
		){ 
			let paletteSize = 0;
			if( this.colorStyle === ColorStyle.Walker ){ paletteSize = this.walkers; } 
			if( this.colorStyle === ColorStyle.Corner ){ paletteSize = this.corners; } 
			const colorList: string[] = [];
			for ( let c = 0 ; c < paletteSize; c++ ){
				let hexString = '';
				for ( let h = 0 ; h < 6 ; h++ ){
					hexString += (Math.floor(Math.random()*16)).toString(16);
					console.log(hexString);
				}
				console.log( '#'+hexString);
				colorList.push( '#'+hexString ); 
			}
			this.currentPalette = new Palette(this.sketch, colorList, this.darkMode ? darkColor : lightColor, this.darkMode ? lightColor : darkColor );
		} 
		
		// set center coords and size
		const center = this.sketch.createVector( this.sketch.width * 0.5, this.sketch.height * 0.5 );
		const radius = this.sketch.width * 0.4;

		// text appearance control
		const labelOutset = 1.1;
		const shrink = Math.log(this.corners);
		const textSize = this.sketch.width * 0.04 / shrink; // shrinks the numbers appropriately up to about 100 corners or so
		const textStroke = this.sketch.width * 0; // no stroke right now, but could be added

		// set the starting point
		this.offset = Math.max( this.offset, this.seq.first );
		this.myIndex = this.offset;

		// set up arrays of walkers
		this.walkerPositions = Array.from({length: this.walkers}, () => center.copy());

		// Set up the windows and return the coordinates of the corners
		this.cornersList = this.chaosWindow( center, radius); // locations of the corners

		// Set frame rate
		this.sketch.frameRate(10);

		// canvas clear/background
		this.sketch.clear();
		this.sketch.background(this.currentPalette.backgroundColor);

		// Draw corner labels if desired
		if ( this.showLabels ) {
			this.sketch.stroke(this.currentPalette.textColor);
			this.sketch.fill(this.currentPalette.textColor);
			this.sketch.strokeWeight(textStroke);
			this.sketch.textSize(textSize);
			this.sketch.textAlign(this.sketch.CENTER,this.sketch.CENTER);
			const cornersLabels = this.chaosWindow(center,(radius)*(labelOutset)); // locations of the labels
			for ( let c = 0 ; c < this.corners ; c++ ) {
				const label = cornersLabels[c];
				this.sketch.text(String(c),label.x,label.y);
			}
		}

		// no stroke (in particular, no outline on circles)
		this.sketch.strokeWeight(0);
	}

	draw() {

		super.draw();

		// we do pixelsPerFrame pixels each time through the draw cycle; this speeds things up essentially
		const pixelsLimit = this.myIndex + Math.min( ( this.num ? this.num - this.myIndex + 1 : this.pixelsPerFrame), this.pixelsPerFrame );
		for( ; this.myIndex < pixelsLimit; this.myIndex++ ){

			// get the term
			const myTerm = this.seq.getElement(this.myIndex);

			// check its modulus to see which corner to walk toward
			const myCorner = this.numModulus(myTerm, this.corners);
			const myCornerPosition = this.cornersList[myCorner];

			// check the index modulus to see which walker is walking
			const myWalker = this.numModulus(this.myIndex, this.walkers);

			// update the walker position
			this.walkerPositions[myWalker].lerp(myCornerPosition, this.frac);
		
			// choose colour to mark position
			let myColor = this.sketch.color(0);
			switch( this.colorStyle ){
				case ColorStyle.Walker:
					myColor = this.currentPalette.colorList[myWalker];
					break;
				case ColorStyle.Corner:
					myColor = this.currentPalette.colorList[myCorner];
					break;
				case ColorStyle.Index:
					if ( this.num ) {
						myColor = this.sketch.lerpColor(this.currentPalette.colorList[0], this.currentPalette.colorList[1], this.myIndex/this.num );
					} else {
						myColor = this.sketch.lerpColor(this.currentPalette.colorList[0], this.currentPalette.colorList[1], this.numModulus(this.myIndex,10000)/10000 );
					}
					break;
				case ColorStyle.Highlight:
					if( myWalker == this.highlightWalker ){
						myColor = this.currentPalette.colorList[0];
					} else {
						myColor = this.currentPalette.colorList[1];
					}
					break;
			}
			myColor.setAlpha(255*this.alpha); // the 255 is needed when in RGB mode; can change in other modes; see p5.js docs on setAlpha

			// draw a circle
			this.sketch.fill(myColor);
			this.sketch.circle( this.walkerPositions[myWalker].x, this.walkerPositions[myWalker].y, this.circSize );
		}

		// stop drawing if we exceed decreed terms
		if ( this.num != 0 && this.myIndex > this.num ){
			this.sketch.noLoop();
		}

	}
	
}

export const exportModule = new VisualizerExportModule(
	"Chaos",
	VisualizerChaos,
	"Chaos game played on a sequence."
);
