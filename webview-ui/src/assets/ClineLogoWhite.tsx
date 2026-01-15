import { SVGProps } from "react"
import uniscientistLogo from "./uniscientist-logo.png"

const ClineLogoWhite = (props: SVGProps<SVGSVGElement>) => (
	<img
		alt="UniScientist Logo"
		height="50"
		src={uniscientistLogo}
		width="47"
		{...(props as any)}
		style={{
			...props.style,
			objectFit: "contain",
		}}
	/>
)
export default ClineLogoWhite
