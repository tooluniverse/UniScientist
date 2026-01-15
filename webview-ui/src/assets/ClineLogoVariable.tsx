import { SVGProps } from "react"
import type { Environment } from "../../../src/config"
import uniscientistLogo from "./uniscientist-logo.png"

/**
 * ClineLogoVariable component renders the Cline logo with automatic theme adaptation
 * and environment-based color indicators.
 *
 * This component uses VS Code theme variables for the fill color, with environment-specific colors:
 * - Local: yellow/orange (development/experimental)
 * - Staging: blue (stable testing)
 * - Production: gray/white (default icon color)
 *
 * @param {SVGProps<SVGSVGElement> & { environment?: Environment }} props - Standard SVG props plus optional environment
 * @returns {JSX.Element} SVG Cline logo that adapts to VS Code themes and environment
 */
const ClineLogoVariable = (props: SVGProps<SVGSVGElement> & { environment?: Environment }) => {
	const { environment, ...svgProps } = props

	/*
	 * UniScientist Logo (Fixed Color PNG)
	 */
	return (
		<img
			alt="UniScientist Logo"
			height="50"
			src={uniscientistLogo}
			width="47"
			{...(svgProps as any)}
			style={{
				...svgProps.style,
				objectFit: "contain",
			}}
		/>
	)
}
export default ClineLogoVariable
