import {P5Visualizer, INVALID_COLOR} from './P5Visualizer'
import {VisualizerExportModule} from './VisualizerInterface'
import type {ViewSize} from './VisualizerInterface'

import {math, MathFormula} from '@/shared/math'
import type {GenericParamDescription} from '@/shared/Paramable'
import {ParamType} from '@/shared/ParamType'
import {ValidationStatus} from '@/shared/ValidationStatus'

/** md
# Self Similarity Visualizer

[<img src="../../assets/img/ModFill/PrimeResidues.png" width="320"
style="margin-left: 1em; margin-right: 0.5em"
/>](../assets/img/ModFill/PrimeResidues.png)
[<img src="../../assets/img/ModFill/DanceNo73.png" width="320"
style="margin-left: 1em; margin-right: 0.5em"
/>](../assets/img/ModFill/DanceNo73.png)
[<img src="../../assets/img/ModFill/OEISA070826.png" width="320"
style="margin-left: 1em; margin-right: 0.5em"
/>](../assets/img/ModFill/OEISA070826.png)

The n-th position in the m-th row of the diagram represents
d(a(n),a(f(n,m))), where f is a function of the user's choice, and
d is a suitable measure of distance.

The default example is d(x,y) = gcd(x,y) and f(n,m) = n+m.  This
shows the gcd between a(n) and a(n+m), i.e. gcd with shifted
copies of the same sequence.

## Parameters
**/

enum DistanceType {
    Absolute_Difference,
    Modular_Difference,
    GCD,
    p_adic_Valuation,
}

enum StarType {
    Circle,
    Rectangle,
}

const paramDesc = {
    /** md
- width: The number of columns to display, which corresponds to the
length of the subsequence we are considering.
     **/
    // note will be small enough to fit in a `number` when we need it to.
    width: {
        default: 150n,
        type: ParamType.BIGINT,
        displayName: 'Width',
        required: true,
        validate: function (n: number, status: ValidationStatus) {
            if (n <= 0) status.addError('Must be positive.')
        },
    },
    /** md
- height: The number of rows to display.
     **/
    // note will be small enough to fit in a `number` when we need it to.
    height: {
        default: 100n,
        type: ParamType.BIGINT,
        displayName: 'Height',
        required: true,
        validate: function (n: number, status: ValidationStatus) {
            if (n <= 0) status.addError('Must be positive.')
        },
    },
    /** md
- shiftFormula: The formula f(n,m) used to determine the index of the term at
position (row, column) = (m,n) which will be compared to a(n).  In other
words, that position will compare a(f(n,m)) with a(n).  Default:
**/
    shiftFormula: {
        default: new MathFormula(
            // Note: The markdown comment closed with */ means to include code
            // into the docs, until mkdocs reaches a comment ending with **/
            /** md */
            `m`
            /* **/
        ),
        type: ParamType.FORMULA,
        inputs: ['n', 'm'],
        displayName: 'Transformation Formula (what we compare)',
        description:
            "A function in 'n' (column) and 'm' (row); "
            + 'this determines the index of the term which '
            + 'in position (m,n) will be compared to a(n).  '
            + "Example:  'm' will compare a(n) to a(m).",
        visibleValue: true,
        required: false,
    },

    /** md
### Distance function:  How to measure the notion of "similarity."

- Modular Difference: smallest distance between residues modulo
a specified modulus (i.e. shortest path around the mod `clock').
- Absolute Difference: absolute value of distance between terms
(brighter = closer).
- GCD: gcd of terms (brighter = relatively larger).
    **/
    distance: {
        default: DistanceType.Modular_Difference,
        type: ParamType.ENUM,
        from: DistanceType,
        displayName: 'Distance function (how we compare)',
        required: true,
    },
    /** md
- modulus:  for use in modular distance.
     **/
    modulus: {
        default: 30n,
        type: ParamType.BIGINT,
        displayName: 'Modulus',
        required: true,
        validate: function (n: number, status: ValidationStatus) {
            if (n <= 0) status.addError('Must be positive.')
        },
        visibleDependency: 'distance',
        visiblePredicate: (dependentValue: DistanceType) =>
            dependentValue === DistanceType.Modular_Difference ? true : false,
    },
    /** md
- backgroundColor: The color used for the background.
     **/
    backgroundColor: {
        default: '#000000',
        type: ParamType.COLOR,
        displayName: 'Background color',
        required: true,
        visibleValue: true,
    },
    /** md
- Fill color: The color used to fill each cell by default.
     **/
    fillColor: {
        default: '#CFAF24',
        type: ParamType.COLOR,
        displayName: 'Fill color',
        required: true,
        visibleValue: true,
    },
    /** md
- Opacity Control:  override in-built opacity function.
     **/
    opacityControl: {
        default: false,
        type: ParamType.BOOLEAN,
        displayName: 'Opacity control',
        required: true,
    },
    /** md
- Opacity Adjustment:  this is a function of s and t (the two terms
being compared) and d (the distance between them) to opacity
(between 0 = transparent and 1 = opaque).  This can be used
to define your own distance function in terms of s and t, for
example, try `isPrime(s^2+t^2)` to see which pairs of terms
have a prime sum of squares.  Default:
     **/
    opacityFormula: {
        default: new MathFormula(
            /** md */
            `(d % 255)/255`
            /* **/
        ),
        type: ParamType.FORMULA,
        displayName: 'Opacity Adjustment',
        inputs: ['s', 't', 'd'],
        description:
            "This function of the two terms ('s' and 't') "
            + "and the distance 'd', giving an output between 0 "
            + '(transparent) and 1 (opaque).',
        required: true,
        visibleDependency: 'opacityControl',
        visibleValue: true,
    },
    /** md
### Indicator shape:  circle or rectangle
    **/
    star: {
        default: StarType.Circle,
        type: ParamType.ENUM,
        from: StarType,
        displayName: 'Indicator shape',
        required: true,
    },
} satisfies GenericParamDescription

class SelfSimilarity extends P5Visualizer(paramDesc) {
    static category = 'Self Similarity'
    static description =
        'Successive rows compare the sequence to its translates,'
        + ' dilations, or other transforms'

    useHeight = 0
    useWidth = 0
    maxHeight = 0
    maxWidth = 0
    rectWidth = 0
    rectHeight = 0
    useMod = 0
    useFillColor = INVALID_COLOR
    useBackColor = INVALID_COLOR
    setBack = false
    gain = 3.07
    tFail = false
    i = 0

    drawNew(position: number) {
        // we draw from left to right, top to bottom
        const X = math.safeNumber(math.modulo(position, this.useWidth))
        const Y = (position - X) / this.useWidth

        // the two sequence elements to compare
        const s = this.seq.getElement(BigInt(X))
        const compareIndex = this.shiftFormula.compute(
            math.safeNumber(X),
            math.safeNumber(Y)
        )
        let t = s
        this.tFail = false
        try {
            t = this.seq.getElement(BigInt(compareIndex))
        } catch {
            this.tFail = true
        }

        // alpha computation
        let alpha = 0
        let diff = 0n
        const termSize = BigInt(
            math.bigmax(math.bigmin(math.bigabs(s), math.bigabs(t)), 1)
        )
        if (this.distance == DistanceType.Modular_Difference) {
            const sResidue = BigInt(math.modulo(BigInt(s), this.modulus))
            const tResidue = BigInt(math.modulo(BigInt(t), this.modulus))
            let diffa = math.modulo(sResidue - tResidue, this.modulus)
            if (2n * diffa > this.modulus) diffa -= this.modulus
            diffa = math.bigabs(diffa)
            let diffb = math.modulo(tResidue - sResidue, this.modulus)
            if (2n * diffa > this.modulus) diffa -= this.modulus
            diffb = math.bigabs(diffb)
            diff = BigInt(math.bigmin(diffa, diffb))
            if (!this.opacityControl) {
                alpha = math.safeNumber((2n * 255n * diff) / this.modulus)
            }
        }
        if (this.distance == DistanceType.Absolute_Difference) {
            diff = BigInt(math.bigabs(s - t))
            if (!this.opacityControl) {
                alpha = math.safeNumber((255n * diff) / termSize)
            }
        }
        if (this.distance == DistanceType.GCD) {
            diff = BigInt(math.biggcd(s, t))
            if (!this.opacityControl) {
                alpha = math.safeNumber((255n * diff) / termSize)
            }
        }
        if (this.distance == DistanceType.p_adic_Valuation) {
            // needs implementing
            if (!this.opacityControl) {
                alpha = 0.5
            }
        }
        if (this.opacityControl) {
            alpha =
                this.opacityFormula.compute(
                    math.safeNumber(s),
                    math.safeNumber(t),
                    math.safeNumber(diff)
                ) * 255
        }

        // draw (as long as both sequence indices exist)
        if (!this.tFail) {
            this.useFillColor.setAlpha(alpha)
            this.sketch.fill(this.useFillColor)
            //this.sketch.stroke(this.useFillColor)
            if (this.star == StarType.Circle) {
                const rad = Math.min(this.rectWidth, this.rectHeight)
                this.sketch.circle(
                    (X + 0.5) * this.rectWidth,
                    (Y + 0.5) * this.rectHeight,
                    rad
                )
            }
            if (this.star == StarType.Rectangle) {
                this.sketch.rect(
                    X * this.rectWidth,
                    Y * this.rectHeight,
                    this.rectWidth,
                    this.rectHeight
                )
            }
        }
    }

    async presketch(size: ViewSize) {
        await super.presketch(size)
        const minWidth = size.width
        const minHeight = size.height
        // 16 was chosen as in ModFill
        this.maxWidth = 16 * minWidth
        this.maxHeight = 16 * minHeight
    }

    setup() {
        super.setup()

        // We need to check if the requested dimensions fit on screen,
        // and adjust if not.

        const dimensions = [
            {
                param: this.height,
                max: this.maxHeight,
                value: 0,
                startWarn: 'Running with maximum height',
                warnings: this.statusOf.height.warnings,
            },
            {
                param: this.width,
                max: this.maxWidth,
                value: 0,
                startWarn: 'Running with maximum width',
                warnings: this.statusOf.width.warnings,
            },
        ]

        dimensions.forEach(dimension => {
            // First, remove any prior dimWarning that might be there
            // (so they don't accumulate from repeated parameter changes):
            const oldWarning = dimension.warnings.findIndex(warn =>
                warn.startsWith(dimension.startWarn)
            )
            if (oldWarning >= 0) dimension.warnings.splice(oldWarning, 1)

            // Now check the dimension and warn if need be:
            // need to do the same with width
            if (dimension.param > dimension.max) {
                dimension.warnings.push(
                    `${dimension.warnings} ${dimension.max}, since `
                        + `${dimension.param} will not fit on screen.`
                )
                dimension.value = dimension.max
            } else dimension.value = Number(dimension.param)
        })

        this.useHeight = dimensions[0].value
        this.useWidth = dimensions[1].value

        // Now we can calculate the cell size and set up to draw:
        this.rectWidth = this.sketch.width / this.useWidth
        this.rectHeight = this.sketch.height / this.useHeight
        this.sketch.noStroke()
        this.i = 0

        // set fill color info
        this.useFillColor = this.sketch.color(this.fillColor)
        this.useBackColor = this.sketch.color(this.backgroundColor)

        // set background
        this.sketch.background(this.backgroundColor)
        this.i = 0
    }

    draw() {
        if (this.i > this.useHeight * this.useWidth) {
            this.stop()
            return
        }
        for (let j = 0; j < 500; j++) {
            this.drawNew(this.i)
            this.i++
        }
    }
}

export const exportModule = new VisualizerExportModule(SelfSimilarity)
