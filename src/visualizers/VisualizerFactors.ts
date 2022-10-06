import type {SequenceInterface} from '../sequences/SequenceInterface'
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
                'The prime number to highlight (if 0 or not a prime, no highlight will be shown).',
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
        const maxVal = Math.max.apply(Math, seqVals)
        const minVal = Math.min.apply(Math, seqVals)

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
        // var facContext = this.sketch.elt.getContext('2d');

        // put all factorizations into an array for easy access
        this.factorizations = []
        for (let myIndex = this.first; myIndex < this.last; myIndex++) {
            // after sequence interface is updated to include
            // the ability to return factors, this should become
            const facsRaw = this.seq.getFactors(myIndex)

            // meanwhile, if we want to use random factors use this:
            // const facsRaw = mockFactors();

            // meanwhile, if we want slow trial division factoring:
            //const facsRaw = slowFactors(
            //   Math.abs(Number(this.seq.getElement(myIndex)))
            //)

            // change the factors into just a list of factors with repeats
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
        // let barGradient
        //     = this.sketch.drawingContext.createLinearGradient(
        //          x, y, x, y+height
        //     );
        // barGradient.addColorStop(0, color1);
        // barGradient.addColorStop(1, color2);
        // this.sketch.drawingContext.fillStyle = barGradient;
        const mySign = -height / Math.abs(height)
        this.sketch.fill(color1)
        this.sketch.rect(x, y - 10 * mySign, width, 10 * mySign)
        this.sketch.fill(color2)
        this.sketch.rect(
            x,
            y - height + 10 * mySign,
            width,
            height - 10 * mySign
        )
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

// temporary function to be removed once actual factors can be obtained
// returns some made up random factors
function mockFactors() {
    const primes = [0, -1, 2, 3, 5, 7, 11, 13]
    const factors: number[][] = []
    for (let i = 0; i < 3; i++) {
        const prime = primes[Math.floor(Math.random() * primes.length)]
        const power = Math.floor(Math.random() * 3)
        const element: number[] = [prime, power]
        factors.push(element)
    }
    return factors
}

// temporary function to be removed once actual factors can be obtained
// returns factors as if every sequence is the integers
function slowFactors(inval: number) {
    const primes = [
        2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61,
        67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137,
        139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211,
        223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283,
        293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379,
        383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461,
        463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563,
        569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643,
        647, 653, 659, 661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739,
        743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827, 829,
        839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937,
        941, 947, 953, 967, 971, 977, 983, 991, 997, 1009, 1013, 1019, 1021,
        1031, 1033, 1039, 1049, 1051, 1061, 1063, 1069, 1087, 1091, 1093,
        1097, 1103, 1109, 1117, 1123, 1129, 1151, 1153, 1163, 1171, 1181,
        1187, 1193, 1201, 1213, 1217, 1223, 1229, 1231, 1237, 1249, 1259,
        1277, 1279, 1283, 1289, 1291, 1297, 1301, 1303, 1307, 1319, 1321,
        1327, 1361, 1367, 1373, 1381, 1399, 1409, 1423, 1427, 1429, 1433,
        1439, 1447, 1451, 1453, 1459, 1471, 1481, 1483, 1487, 1489, 1493,
        1499, 1511, 1523, 1531, 1543, 1549, 1553, 1559, 1567, 1571, 1579,
        1583, 1597, 1601, 1607, 1609, 1613, 1619, 1621, 1627, 1637, 1657,
        1663, 1667, 1669, 1693, 1697, 1699, 1709, 1721, 1723, 1733, 1741,
        1747, 1753, 1759, 1777, 1783, 1787, 1789, 1801, 1811, 1823, 1831,
        1847, 1861, 1867, 1871, 1873, 1877, 1879, 1889, 1901, 1907, 1913,
        1931, 1933, 1949, 1951, 1973, 1979, 1987, 1993, 1997, 1999, 2003,
        2011, 2017, 2027, 2029, 2039, 2053, 2063, 2069, 2081, 2083, 2087,
        2089, 2099, 2111, 2113, 2129, 2131, 2137, 2141, 2143, 2153, 2161,
        2179, 2203, 2207, 2213, 2221, 2237, 2239, 2243, 2251, 2267, 2269,
        2273, 2281, 2287, 2293, 2297, 2309, 2311, 2333, 2339, 2341, 2347,
        2351, 2357, 2371, 2377, 2381, 2383, 2389, 2393, 2399, 2411, 2417,
        2423, 2437, 2441, 2447, 2459, 2467, 2473, 2477, 2503, 2521, 2531,
        2539, 2543, 2549, 2551, 2557, 2579, 2591, 2593, 2609, 2617, 2621,
        2633, 2647, 2657, 2659, 2663, 2671, 2677, 2683, 2687, 2689, 2693,
        2699, 2707, 2711, 2713, 2719, 2729, 2731, 2741, 2749, 2753, 2767,
        2777, 2789, 2791, 2797, 2801, 2803, 2819, 2833, 2837, 2843, 2851,
        2857, 2861, 2879, 2887, 2897, 2903, 2909, 2917, 2927, 2939, 2953,
        2957, 2963, 2969, 2971, 2999, 3001, 3011, 3019, 3023, 3037, 3041,
        3049, 3061, 3067, 3079, 3083, 3089, 3109, 3119, 3121, 3137, 3163,
        3167, 3169, 3181, 3187, 3191, 3203, 3209, 3217, 3221, 3229, 3251,
        3253, 3257, 3259, 3271, 3299, 3301, 3307, 3313, 3319, 3323, 3329,
        3331, 3343, 3347, 3359, 3361, 3371, 3373, 3389, 3391, 3407, 3413,
        3433, 3449, 3457, 3461, 3463, 3467, 3469, 3491, 3499, 3511, 3517,
        3527, 3529, 3533, 3539, 3541, 3547, 3557, 3559, 3571, 3581, 3583,
        3593, 3607, 3613, 3617, 3623, 3631, 3637, 3643, 3659, 3671, 3673,
        3677, 3691, 3697, 3701, 3709, 3719, 3727, 3733, 3739, 3761, 3767,
        3769, 3779, 3793, 3797, 3803, 3821, 3823, 3833, 3847, 3851, 3853,
        3863, 3877, 3881, 3889, 3907, 3911, 3917, 3919, 3923, 3929, 3931,
        3943, 3947, 3967, 3989, 4001, 4003, 4007, 4013, 4019, 4021, 4027,
        4049, 4051, 4057, 4073, 4079, 4091, 4093, 4099, 4111, 4127, 4129,
        4133, 4139, 4153, 4157, 4159, 4177, 4201, 4211, 4217, 4219, 4229,
        4231, 4241, 4243, 4253, 4259, 4261, 4271, 4273, 4283, 4289, 4297,
        4327, 4337, 4339, 4349, 4357, 4363, 4373, 4391, 4397, 4409, 4421,
        4423, 4441, 4447, 4451, 4457, 4463, 4481, 4483, 4493, 4507, 4513,
        4517, 4519, 4523, 4547, 4549, 4561, 4567, 4583, 4591, 4597, 4603,
        4621, 4637, 4639, 4643, 4649, 4651, 4657, 4663, 4673, 4679, 4691,
        4703, 4721, 4723, 4729, 4733, 4751, 4759, 4783, 4787, 4789, 4793,
        4799, 4801, 4813, 4817, 4831, 4861, 4871, 4877, 4889, 4903, 4909,
        4919, 4931, 4933, 4937, 4943, 4951, 4957, 4967, 4969, 4973, 4987,
        4993, 4999, 5003, 5009, 5011, 5021, 5023, 5039, 5051, 5059, 5077,
        5081, 5087, 5099, 5101, 5107, 5113, 5119, 5147, 5153, 5167, 5171,
        5179, 5189, 5197, 5209, 5227, 5231, 5233, 5237, 5261, 5273, 5279,
        5281, 5297, 5303, 5309, 5323, 5333, 5347, 5351, 5381, 5387, 5393,
        5399, 5407, 5413, 5417, 5419, 5431, 5437, 5441, 5443, 5449, 5471,
        5477, 5479, 5483, 5501, 5503, 5507, 5519, 5521, 5527, 5531, 5557,
        5563, 5569, 5573, 5581, 5591, 5623, 5639, 5641, 5647, 5651, 5653,
        5657, 5659, 5669, 5683, 5689, 5693, 5701, 5711, 5717, 5737, 5741,
        5743, 5749, 5779, 5783, 5791, 5801, 5807, 5813, 5821, 5827, 5839,
        5843, 5849, 5851, 5857, 5861, 5867, 5869, 5879, 5881, 5897, 5903,
        5923, 5927, 5939, 5953, 5981, 5987, 6007, 6011, 6029, 6037, 6043,
        6047, 6053, 6067, 6073, 6079, 6089, 6091, 6101, 6113, 6121, 6131,
        6133, 6143, 6151, 6163, 6173, 6197, 6199, 6203, 6211, 6217, 6221,
        6229, 6247, 6257, 6263, 6269, 6271, 6277, 6287, 6299, 6301, 6311,
        6317, 6323, 6329, 6337, 6343, 6353, 6359, 6361, 6367, 6373, 6379,
        6389, 6397, 6421, 6427, 6449, 6451, 6469, 6473, 6481, 6491, 6521,
        6529, 6547, 6551, 6553, 6563, 6569, 6571, 6577, 6581, 6599, 6607,
        6619, 6637, 6653, 6659, 6661, 6673, 6679, 6689, 6691, 6701, 6703,
        6709, 6719, 6733, 6737, 6761, 6763, 6779, 6781, 6791, 6793, 6803,
        6823, 6827, 6829, 6833, 6841, 6857, 6863, 6869, 6871, 6883, 6899,
        6907, 6911, 6917, 6947, 6949, 6959, 6961, 6967, 6971, 6977, 6983,
        6991, 6997, 7001, 7013, 7019, 7027, 7039, 7043, 7057, 7069, 7079,
        7103, 7109, 7121, 7127, 7129, 7151, 7159, 7177, 7187, 7193, 7207,
        7211, 7213, 7219, 7229, 7237, 7243, 7247, 7253, 7283, 7297, 7307,
        7309, 7321, 7331, 7333, 7349, 7351, 7369, 7393, 7411, 7417, 7433,
        7451, 7457, 7459, 7477, 7481, 7487, 7489, 7499, 7507, 7517, 7523,
        7529, 7537, 7541, 7547, 7549, 7559, 7561, 7573, 7577, 7583, 7589,
        7591, 7603, 7607, 7621, 7639, 7643, 7649, 7669, 7673, 7681, 7687,
        7691, 7699, 7703, 7717, 7723, 7727, 7741, 7753, 7757, 7759, 7789,
        7793, 7817, 7823, 7829, 7841, 7853, 7867, 7873, 7877, 7879, 7883,
        7901, 7907, 7919, 7927, 7933, 7937, 7949, 7951, 7963, 7993, 8009,
        8011, 8017, 8039, 8053, 8059, 8069, 8081, 8087, 8089, 8093, 8101,
        8111, 8117, 8123, 8147, 8161, 8167, 8171, 8179, 8191, 8209, 8219,
        8221, 8231, 8233, 8237, 8243, 8263, 8269, 8273, 8287, 8291, 8293,
        8297, 8311, 8317, 8329, 8353, 8363, 8369, 8377, 8387, 8389, 8419,
        8423, 8429, 8431, 8443, 8447, 8461, 8467, 8501, 8513, 8521, 8527,
        8537, 8539, 8543, 8563, 8573, 8581, 8597, 8599, 8609, 8623, 8627,
        8629, 8641, 8647, 8663, 8669, 8677, 8681, 8689, 8693, 8699, 8707,
        8713, 8719, 8731, 8737, 8741, 8747, 8753, 8761, 8779, 8783, 8803,
        8807, 8819, 8821, 8831, 8837, 8839, 8849, 8861, 8863, 8867, 8887,
        8893, 8923, 8929, 8933, 8941, 8951, 8963, 8969, 8971, 8999, 9001,
        9007, 9011, 9013, 9029, 9041, 9043, 9049, 9059, 9067, 9091, 9103,
        9109, 9127, 9133, 9137, 9151, 9157, 9161, 9173, 9181, 9187, 9199,
        9203, 9209, 9221, 9227, 9239, 9241, 9257, 9277, 9281, 9283, 9293,
        9311, 9319, 9323, 9337, 9341, 9343, 9349, 9371, 9377, 9391, 9397,
        9403, 9413, 9419, 9421, 9431, 9433, 9437, 9439, 9461, 9463, 9467,
        9473, 9479, 9491, 9497, 9511, 9521, 9533, 9539, 9547, 9551, 9587,
        9601, 9613, 9619, 9623, 9629, 9631, 9643, 9649, 9661, 9677, 9679,
        9689, 9697, 9719, 9721, 9733, 9739, 9743, 9749, 9767, 9769, 9781,
        9787, 9791, 9803, 9811, 9817, 9829, 9833, 9839, 9851, 9857, 9859,
        9871, 9883, 9887, 9901, 9907, 9923, 9929, 9931, 9941, 9949, 9967,
        9973,
    ]

    const factors: number[][] = []

    for (let i = 0; i < 3; i++) {
        if (inval == 0) {
            return []
        }
        if (inval < 0) {
            inval = -inval
        }
        for (let i = 0; i < primes.length; i++) {
            let done = 0
            while (done == 0) {
                if (inval % primes[i] == 0) {
                    const element: number[] = [primes[i], 1]
                    factors.push(element)
                    inval = inval / primes[i]
                } else {
                    done = 1
                }
            }
        }
    }
    return factors
}

export const exportModule = new VisualizerExportModule(
    'Factors',
    VisualizerFactors,
    'Graphing factorization visualizer.'
)
