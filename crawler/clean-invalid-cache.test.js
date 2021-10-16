const rewire = require("rewire")
const clean_invalid_cache = rewire("./clean-invalid-cache")
const makeLogFile = clean_invalid_cache.__get__("makeLogFile")
// @ponicode
describe("makeLogFile", () => {
    test("0", () => {
        let callFunction = () => {
            makeLogFile("script.py", "songs")
        }
    
        expect(callFunction).not.toThrow()
    })

    test("1", () => {
        let callFunction = () => {
            makeLogFile("install.deb", "contact")
        }
    
        expect(callFunction).not.toThrow()
    })

    test("2", () => {
        let callFunction = () => {
            makeLogFile("image.png", "audio")
        }
    
        expect(callFunction).not.toThrow()
    })

    test("3", () => {
        let callFunction = () => {
            makeLogFile("install.deb", "text/plain")
        }
    
        expect(callFunction).not.toThrow()
    })

    test("4", () => {
        let callFunction = () => {
            makeLogFile("index.js", "application/data")
        }
    
        expect(callFunction).not.toThrow()
    })

    test("5", () => {
        let callFunction = () => {
            makeLogFile(undefined, undefined)
        }
    
        expect(callFunction).not.toThrow()
    })
})
