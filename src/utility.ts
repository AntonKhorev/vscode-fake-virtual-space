import * as vscode from 'vscode'

export function combineCoincidingSelections(selections:vscode.Selection[]):vscode.Selection[] {
	const emptySelections:Record<number,Record<number,boolean>>={}
	const result=[]
	for (const selection of selections) {
		if (!selection.isEmpty) {
			result.push(selection)
			continue
		}
		if (!emptySelections[selection.active.line]) {
			emptySelections[selection.active.line]={}
		}
		if (!emptySelections[selection.active.line][selection.active.character]) {
			emptySelections[selection.active.line][selection.active.character]=true
			result.push(selection)
			continue
		}
	}
	return result
}

export function getVerticalMoveInsertion(
	tabSize: number,
	character1: number,
	text1: string,
	character2: number,
	text2: string
): string|null {
	if (character2<text2.length) return null
	let indent=''
	const inSameTabSlot=(width1:number,width2:number):boolean=>{
		return Math.floor(width1/tabSize)==Math.floor(width2/tabSize)
	}
	const nextWidth=makeNextWidthComputer(tabSize)
	const nextWidthAddingToIndent=(width:number,char:string):number=>{
		while (
			char=='\t' &&
			indent.length>0 &&
			indent[indent.length-1]==' ' &&
			inSameTabSlot(width,width-1)
		) {
			indent=indent.slice(0,-1)
			width--
		}
		indent+=char
		return nextWidth(width,char)
	}
	let prevWidth1
	let width1=0
	let width2=0
	let i2=0
	for (let i1=0;i1<character1;i1++) {
		prevWidth1=width1
		width1=nextWidth(width1,text1[i1])
		while (width2<width1) {
			if (i2<text2.length) {
				width2=nextWidth(width2,text2[i2++])
			} else if (text1[i1]=='\t' && inSameTabSlot(prevWidth1,width2)) {
				width2=nextWidthAddingToIndent(width2,'\t')
			} else {
				width2=nextWidthAddingToIndent(width2,' ')
			}
		}
	}
	if (indent=='') return null
	return indent
}

export function isKnownWrappingIndent(wrappingIndent: string): boolean {
	return ['none','same','indent','deepIndent'].includes(wrappingIndent)
}

export function getColumnInsideWrappedLine(
	tabSize: number,
	wrappingIndent: string, // 'none'|'same'|'indent'|'deepIndent',
	text: string,
	homeCharacter: number,
	cursorCharacter: number
): number {
	const nextWidth=makeNextWidthComputer(tabSize)
	let width=getIndentWidth(nextWidth,wrappingIndent,text,homeCharacter)
	for (let i=homeCharacter;i<cursorCharacter;i++) {
		width=nextWidth(width,text[i])
	}
	return width
}

/**
  * @returns [optimal character to move to, if the target column is reached and not overshot by indent or tab]
  */
export function getCharacterInsideWrappedLine(
	tabSize: number,
	wrappingIndent: string, // 'none'|'same'|'indent'|'deepIndent',
	text: string,
	homeCharacter: number,
	endCharacter: number,
	column: number
): [number,boolean] {
	const nextWidth=makeNextWidthComputer(tabSize)
	let width=getIndentWidth(nextWidth,wrappingIndent,text,homeCharacter)
	let i=homeCharacter
	for (;i<endCharacter;i++) {
		if (column<=width) return [i,column==width]
		width=nextWidth(width,text[i])
	}
	return [i,column==width]
}

function getIndentWidth(
	nextWidth: (width:number,char:string)=>number,
	wrappingIndent: string, // 'none'|'same'|'indent'|'deepIndent',
	text: string,
	homeCharacter: number
): number {
	const isIndentChar=(char:string):boolean=>(char==' ' || char=='\t')
	let width=0
	if (homeCharacter==0) return width
	if (wrappingIndent=='none') return width
	for (let i=0;i<homeCharacter;i++) {
		if (!isIndentChar(text[i])) break
		width=nextWidth(width,text[i])
	}
	if (wrappingIndent=='same') return width
	width=nextWidth(width,'\t')
	if (wrappingIndent=='indent') return width
	width=nextWidth(width,'\t')
	//if (wrappingIndent=='deepIndent') return width
	return width
}

function makeNextWidthComputer(tabSize:number) {
	return (width:number,char:string):number=>{
		if (char=='\t') {
			return (Math.floor(width/tabSize)+1)*tabSize
		} else {
			return width+1
		}
	}
}
