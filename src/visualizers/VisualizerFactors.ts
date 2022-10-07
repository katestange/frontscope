//import type {SequenceInterface} from '../sequences/SequenceInterface'
import {VisualizerExportModule} from '@/visualizers/VisualizerInterface'
import type p5 from 'p5'
import {VisualizerDefault} from './VisualizerDefault'

// p5 factor Visualizer colour palette class
class factorPalette {
    gradientBar: {[key: string]: p5.Color} = {}
    gradientHighlight: {[key: string]: p5.Color} = {}
    gradientMouse: {[key: string]: p5.Color} = {}
    backgroundColor: p5.Color
    constructor(
        sketch: p5,
        // bottom to top
        hexBar: string[] = ['#876BB8', '#C3B7DB'], // violet, dark bottom
        hexHighlight: string[] = ['#EC7E2B', '#F5CD95'], // orange, dark bottom
        hexMouse: string[] = ['#589C48', '#7BB662'], // green, dark bottom
        hexBack = '#EBEAF3' // light violet
    ) {
        this.gradientBar = {
            bottom: sketch.color(hexBar[0]),
            top: sketch.color(hexBar[1]),
        }
        this.gradientHighlight = {
            bottom: sketch.color(hexHighlight[0]),
            top: sketch.color(hexHighlight[1]),
        }
        this.gradientMouse = {
            bottom: sketch.color(hexMouse[0]),
            top: sketch.color(hexMouse[1]),
        }
        this.backgroundColor = sketch.color(hexBack)
    }
}
interface bar {
    prime: bigint
    log: number
}

class VisualizerFactors extends VisualizerDefault {
    name = 'Factors'

    private terms = 10000
    private highlightPrime = 0n
    params = {
        terms: {
            value: this.terms,
            forceType: 'integer',
            displayName: 'Number of terms',
            required: true,
            description: 'The number of terms to graph.',
        },
        highlightPrime: {
            value: this.highlightPrime,
            forceType: 'integer',
            displayName: 'Highlighted prime',
            required: false,
            description:
                'The prime number to highlight (if 0 or not a'
                + ' prime, no highlight will be shown).',
        },
    }

    // we need access to the HTML5 when we implement gradients
    // which may look something like this
    // private canvas = document.getElementById('canvas');

    // current state variables used in setup and draw
    private palette = new factorPalette(this.sketch)
    private mousePrime = 0n
    private mouseOn = false
    private factorizations: bar[][] = []
    private scaleFactor = 1.0
    private first = 0
    private last = 0
    private heightScale = 55
    private graphCorner = this.sketch.createVector(0, 0)
    private textCorner = this.sketch.createVector(0, 0)
    private recSpace = this.sketch.createVector(0, 0)
    private recWidth = 12
    private textInterval = 0
    private textSize = 0

    checkParameters() {
        const status = super.checkParameters()

        if (this.params.terms.value < 1) {
            status.errors.push('The number of terms must be an integer > 0.')
        }

        if (status.errors.length > 0) status.isValid = false
        return status
    }

    barsShowing() {
        // determine which terms will be on the screen
        // in order to decide how to initialize the graph
        // and to be efficient in computing only the portion shown
        const minBars = Math.max(
            Math.floor(
                this.first - Math.min(0, this.graphCorner.x / this.recSpace.x)
            ) - 1,
            this.first
        )
        const numBars = Math.min(
            this.sketch.width / this.scaleFactor / this.recSpace.x + 2,
            this.last - minBars
        )
        const maxBars = minBars + numBars
        return {
            minBars: minBars,
            maxBars: maxBars,
            numBars: Math.floor(numBars),
        }
    }

    setup() {
        super.setup()

        // must be set so barsShowing() works
        this.scaleFactor = 1
        // horiz rectangle spacing
        this.recSpace = this.sketch.createVector(this.recWidth + 2, 0)
        // lower left graph corner
        this.graphCorner = this.sketch.createVector(
            this.sketch.width * 0.05,
            this.sketch.height * 0.7
        )

        // set up terms first and last
        this.first = this.seq.first
        this.last = this.terms
        if (this.seq.last < this.last) {
            this.last = this.seq.last
        }

        // collect some info on the sequence in order to decide
        // how best to show the initial graph
        const barsInfo = this.barsShowing()
        const seqVals = Array.from(Array(barsInfo.numBars), (_, i) =>
            Number(this.seq.getElement(i + barsInfo.minBars))
        )
        const maxVal = Math.max(...seqVals)
        const minVal = Math.min(...seqVals)

        // we compute the graphHeight to scale graph to fit
        let heightMax =
            Math.sign(maxVal) * Math.log(Math.max(2, Math.abs(maxVal)))
        let heightMin =
            Math.sign(minVal) * Math.log(Math.max(2, Math.abs(minVal)))
        heightMax = Math.max(heightMax, 0)
        heightMin = Math.min(heightMin, 0)
        // scale according to total graph height
        const graphHeight = Math.abs(heightMax - heightMin)
        if (graphHeight != 0) {
            this.heightScale = (0.4 * this.sketch.height) / graphHeight
        } else {
            // should occur only for constant 0 seq
            this.heightScale = 0.4 * this.sketch.height
        }
        // adjust the x-axis upward to make room
        this.graphCorner.y = this.graphCorner.y + heightMin * this.heightScale

        // upper left text corner
        this.textCorner = this.sketch.createVector(
            this.sketch.width * 0.05,
            this.sketch.height * 0.8
        )
        // vertical text spacing
        this.textInterval = this.sketch.height * 0.027
        this.textSize = this.sketch.height * 0.023

        this.sketch.frameRate(30)
        this.sketch.textFont('Courier New')
        this.sketch.textStyle(this.sketch.NORMAL)

        // no stroke (rectangles without borders)
        this.sketch.strokeWeight(0)

        // we need a 2d context for gradients in p5
        // eventually do something like this:
        //var facContext = this.sketch.elt.getContext('2d');
        const facContext = this.sketch.drawingContext

        // put all factorizations into an array for easy access
        this.factorizations = []
        for (let myIndex = this.first; myIndex < this.last; myIndex++) {
            const facsRaw = this.seq.getFactors(myIndex)

            // change the factors into just a list of factors with repeats
            // suitable for looping through the make the bars
            // format: [prime, log(prime)]
            const factors: bar[] = []
            if (facsRaw) {
                for (const [base, power] of facsRaw) {
                    if (base != -1n && base != 0n) {
                        for (let i = 0; i < power; i++) {
                            const logPrime = BigLog(base)
                            const thisBar = {prime: base, log: logPrime}
                            factors.push(thisBar)
                        }
                    }
                }
            }
            this.factorizations[myIndex] = factors
        }
    }

    draw() {
        super.draw()

        // keyboard control for zoom, pan, stretch
        if (this.sketch.keyIsDown(73)) {
            // zoom in I
            this.scaleFactor *= 1.03
            this.graphCorner.y = this.graphCorner.y / 1.03
        }
        if (this.sketch.keyIsDown(75)) {
            // zoom out K
            this.scaleFactor *= 0.97
            this.graphCorner.y = this.graphCorner.y / 0.97
        }
        if (this.sketch.keyIsDown(74)) {
            // pan left J
            this.graphCorner.x -= 10 / this.scaleFactor
        }
        if (this.sketch.keyIsDown(76)) {
            // pan right L
            this.graphCorner.x += 10 / this.scaleFactor
        }
        if (this.sketch.keyIsDown(89)) {
            // pan up Y
            this.graphCorner.y -= 10 / this.scaleFactor
        }
        if (this.sketch.keyIsDown(72)) {
            // pan down H
            this.graphCorner.y += 10 / this.scaleFactor
        }
        if (this.sketch.keyIsDown(85)) {
            // stretch up U
            this.heightScale += 5
        }
        if (this.sketch.keyIsDown(79)) {
            // contract down O
            this.heightScale -= 5
        }

        this.sketch.clear(0, 0, 0, 0)
        this.sketch.background(this.palette.backgroundColor)

        // this scales the whole sketch
        // must compensate when using invariant sketch elements
        this.sketch.scale(this.scaleFactor)

        this.mouseOn = false // flag whether mouse is over the graph or not
        let mouseIndex = 0 // the term the mouse is hovering over

        let bottomColor = this.palette.gradientBar.bottom
        let topColor = this.palette.gradientBar.top

        // determine which terms will be on the screen so we only graph those
        const barsInfo = this.barsShowing()

        // loop through the terms of the seq
        for (
            let myIndex = barsInfo.minBars;
            myIndex < barsInfo.maxBars;
            myIndex++
        ) {
            let mySign = 1
            if (this.seq.getElement(myIndex) < 0) {
                mySign = -1
            }
            const factors = this.factorizations[myIndex] // get factors
            let cumulHt = 0 // how much of the bar we've drawn so far

            // primeType = 0 means the highlighted one (draw first)
            // primeType = 1 means the rest of the primes
            for (let primeType = 0; primeType < 2; primeType++) {
                // loop through bars to draw for term
                for (
                    let facIndex = 0;
                    facIndex < factors.length;
                    facIndex++
                ) {
                    const factor = factors[facIndex]

                    // Select the primes based on primeType
                    if (
                        (primeType == 0
                            && factor.prime == this.highlightPrime)
                        || (primeType == 1
                            && factor.prime != this.highlightPrime)
                    ) {
                        // height of rectangle is log of factor
                        // times scaling parameter
                        const recHeight =
                            mySign * factor.log * this.heightScale

                        // set colour gradient for rectangle
                        let gradient = this.palette.gradientBar
                        if (primeType == 0) {
                            gradient = this.palette.gradientHighlight
                        }
                        if (factor.prime == this.mousePrime) {
                            gradient = this.palette.gradientMouse
                        }
                        bottomColor = gradient.bottom
                        topColor = gradient.top

                        // determine where to put the rectangle
                        const barStart = this.graphCorner.copy()
                        const moveOver = this.recSpace.copy()
                        moveOver.mult(myIndex - this.first)
                        const moveUp = this.sketch.createVector(0, -cumulHt)
                        barStart.add(moveOver)
                        barStart.add(moveUp)
                        const barDiag = this.sketch.createVector(
                            this.recWidth,
                            recHeight
                        )
                        // draw the rectangle
                        this.grad_rect(
                            barStart.x,
                            barStart.y,
                            barDiag.x,
                            barDiag.y,
                            topColor,
                            bottomColor
                        )

                        // if the mouse is over the rectangle being drawn
                        // then we make note of the prime factor
                        // and term we are hovering over
                        const testVec = this.sketch.createVector(
                            this.sketch.mouseX,
                            this.sketch.mouseY
                        )
                        testVec.mult(1 / this.scaleFactor).sub(barStart)
                        testVec.y = testVec.y * mySign
                        const barDiagAbs = barDiag.copy()
                        barDiagAbs.y = -barDiagAbs.y * mySign
                        if (
                            testVec.x >= 0
                            && testVec.x <= barDiagAbs.x
                            && testVec.y <= 0
                            && testVec.y >= barDiagAbs.y
                        ) {
                            this.mousePrime = factor.prime
                            mouseIndex = myIndex
                            this.mouseOn = true
                        }

                        // bookkeeping
                        cumulHt += recHeight
                    }
                }
            }
        }

        // text at base of sketch, if not small canvas
        if (this.sketch.height > 400) {
            this.sketch.textSize(this.textSize / this.scaleFactor)
            const textPosition = this.textCorner.copy()
            textPosition.mult(1 / this.scaleFactor)
            const textIntervalVec = this.sketch.createVector(
                0,
                this.textInterval
            )
            textIntervalVec.mult(1 / this.scaleFactor)
            const info = [
                'Click select; J/L pan; I/K zoom; U/O stretch; Y/H raise/lower',
                'Highlighted prime: ' + this.highlightPrime.toString(),
            ]
            const infoColors = [
                this.palette.gradientBar.bottom,
                this.palette.gradientHighlight.bottom,
            ]
            for (let i = 0; i < info.length; i++) {
                this.sketch.fill(infoColors[i])
                this.sketch.text(info[i], textPosition.x, textPosition.y)
                textPosition.add(textIntervalVec)
            }
            if (this.mouseOn) {
                const factorizationPrimes = this.factorizations[
                    mouseIndex
                ].map(factor => factor.prime)
                const factorizationPrimesPre = factorizationPrimes.filter(
                    factor => factor < this.mousePrime
                )
                const factorizationPrimesMouse = factorizationPrimes.filter(
                    factor => factor == this.mousePrime
                )
                const factorizationPrimesPost = factorizationPrimes.filter(
                    factor => factor > this.mousePrime
                )
                const factorStringParts = [
                    'S('
                        + mouseIndex.toString()
                        + ') = '
                        + this.seq.getElement(mouseIndex).toString()
                        + ' = '
                        + factorizationPrimesPre.toString()
                        + `${factorizationPrimesPre.length > 0 ? ',' : ''}`,
                    factorizationPrimesMouse.toString(),
                    `${factorizationPrimesPost.length > 0 ? ',' : ''}`
                        + factorizationPrimesPost.toString(),
                ]
                const factorStringColors = [
                    this.palette.gradientBar.bottom,
                    this.palette.gradientMouse.bottom,
                    this.palette.gradientBar.bottom,
                ]
                for (let i = 0; i < factorStringParts.length; i++) {
                    this.sketch.fill(factorStringColors[i])
                    this.sketch.text(
                        factorStringParts[i],
                        textPosition.x,
                        textPosition.y
                    )
                    textPosition.add(
                        this.sketch.createVector(
                            this.sketch.textWidth(factorStringParts[i]),
                            0
                        )
                    )
                }
            } else {
                // make sure mouseover disappears when not on graph
                this.mousePrime = 0n
            }
        }
    }

    mouseClicked() {
        // currently this function doesn't work
        // but it is ready to go when issue #120 is resolved
        if (this.mouseOn) {
            this.highlightPrime = this.mousePrime
        } else {
            this.highlightPrime = 0n
        }
    }

    grad_rect(
        x: number,
        y: number,
        width: number,
        height: number,
        color1: p5.Color,
        color2: p5.Color
    ) {
        // once we have drawing context, we can do something like
        const barGradient = this.sketch.drawingContext.createLinearGradient(
            x,
            y,
            x,
            y - height
        )
        barGradient.addColorStop(0, color1)
        barGradient.addColorStop(1, color2)
        this.sketch.drawingContext.fillStyle = barGradient
        const mySign = -height / Math.abs(height)
        //this.sketch.fill(color1)
        //this.sketch.rect(x, y - 10 * mySign, width, 10 * mySign)
        //this.sketch.fill(color2)
        this.sketch.rect(x, y - height, width, height)
    }
}

// bigint logarithm base 10
// from https://stackoverflow.com/questions/70382306/logarithm-of-a-bigint
function BigLog10(n: bigint) {
    if (n < 0) return NaN
    const s = n.toString(10)
    return s.length + Math.log10(Number('0.' + s.substring(0, 15)))
}
function BigLog(n: bigint) {
    return BigLog10(n) / Math.log10(Math.E)
}

export const exportModule = new VisualizerExportModule(
    'Factors',
    VisualizerFactors,
    'Graphing factorization visualizer.'
)
