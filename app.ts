import fastify from "fastify"
import { Prisma, PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
import fastifyPlugin from "fastify-plugin"
import { fastifyJwt } from "@fastify/jwt"
const bcrypt = require("bcrypt")

const app = fastify({logger:true})

//premenna ktorej hodnota sa meni vo funkcii nizsie, pouziva sa v jednotlivych endpointoch na check ci overenie prebehlo uspesne
var verified:number = 0


//funkcia na overenie, ci token v sebe nesie username a heslo ktore existuje v databaze - arg. callback je
//funkcia ktora je definovana v jednotlivych endpointoch a spusti sa ak je verifikacia uspesna

async function Verify(username:string,password:string,callback:any){

    interface psw {password:string}

    const returnedList:object[] = await prisma.users.findMany(
        {where:{username:username},
        select:{
            password: true
        }}
    )
    if(returnedList.length == 0){
        //pass
    }else{

        const pasw_obj:psw = Object(returnedList[0])
        const passwordDB:string = pasw_obj.password
        bcrypt.compare(password,passwordDB).then((match:any)=>{
            if(!match){
                //pass
            } else {
                callback
                //ak overenie prebehne uspesne, zavola sa callback a hodnota verify sa zmeni na 1
                verified = 1
            }
        })
    }
}

//============================================ ENDPOINTS FOR ATORIZATION =============================================================

app.register(require('@fastify/jwt'), {
    secret: "supersecretkey"
})

interface IBody_auth {username:string,password:string}

//================================LOGIN========================

app.post<{Body:IBody_auth}>("/login",(req,rep)=>{

    const {username,password} = req.body   

    async function getList(username:string,password:string){

        interface psw {password:string}

        const returnedList:object[] = await prisma.users.findMany(
            {where:{username:username},
            select:{
                password: true
            }}
        )
        
        if(returnedList.length == 0){
            rep.send("invalid credentials")
        }else{

            const pasw_obj:psw = Object(returnedList[0])
            const passwordDB:string = pasw_obj.password

            bcrypt.compare(password,passwordDB).then((match:any)=>{
                if(!match){
                    rep.send("invalid credentials")
                } else {
                    const token = app.jwt.sign({ "username": username, "password":password })
                    rep.send({ token })
                }
            })
        }
    }
    getList(username,password)
})

//================================REGISTRACIA========================

app.post<{Body:IBody_auth}>("/register",(req,rep)=>{

    const {username,password} = req.body
    
    async function RegisterUsers (username:string,password:string){

        const count = await prisma.users.count({where:{username:username}})

        if(count == 0){
            bcrypt.hash(password,10).then(async(hash:any)=>{
                var hashed_password:string = hash

                const newUser = await prisma.users.create({data:{
                    username:username,
                    password:hashed_password}})
            })

            rep.send("success")
        
        }else{
            rep.send("Username already exists")
        }   
    }

    RegisterUsers(username,password)
    
  })


//============================================ ENDPOINTS FOR USING =============================================================

interface item {title:string,text:string,deadline:string,createdBy:string,flag:string}
interface IBody {owners:string[],to_DOs:{[key:string]:Array<item>}}
interface Iquerystring {listsID:string,listName:string}
interface newitem {newitem:item}
interface Iquerystring_update_flag {listsID:string,listName:string,itemNumber:string}
interface newflag {newFlag:string}

//===========================================ENDPOINT FOR UPDATING FLAG=====================================

app.put<{Querystring:Iquerystring_update_flag,Body:newflag}>("/update_flag",(req,rep)=>{

    const listID = +req.query.listsID
    const listName = req.query.listName
    const itemNumber = +req.query.itemNumber
    const newFlag = req.body.newFlag

//============FUNCTION FOR UPDATING FLAG=======================
    
    async function updateFlag(input_id:number,listname:string,itemnumber:number,newflag:string,username:string){

        //check ci je pouzivatel previazany na zoznam
        const ownersDB = await prisma.to_do_lists.findUnique(
            {where:{id:input_id},
            select:{
                owners: true
            }}
        )
        const ownersOBJ:{owners:string[]} = Object(ownersDB)

        if(ownersOBJ.owners.includes(username)){

        //vytiahne z databazy prislusny To Do list, z neho prislusnu polozku a z nej flag , ktoremu priradi novu hodnotu,
        //nasledne sa zapise cely To Do list nazad do databazy na rovnaku poziciu ako predtym
        const returnedLists = await prisma.to_do_lists.findUnique(
            {where:{id:input_id},
            select:{
                to_DOs: true
            }}
        )

        var fromDB:object = Object(returnedLists?.to_DOs!)
        var list:object[] = fromDB[listname as keyof typeof fromDB]
        var item_updated:item = Object(list[itemnumber -1])
        item_updated.flag = newflag
        
        const promise = await prisma.to_do_lists.update({
        where:{id:input_id},
        data:{
            to_DOs:fromDB
        }
    })
    rep.send("success")
    }else{
        rep.send("User is not owner of To_Do lists")
    }}

//============ FLOW =======================

    const auth:string = String(req.headers.authorization)
    
    app.jwt.verify(auth.split(' ')[1],(err,decoded)=>{
    
    if (err){
        rep.send("invalid token")
    }else{
        const username = decoded.username
        const password = decoded.password
        Verify(username,password,updateFlag(listID,listName,itemNumber,newFlag,username))

        //verified je definovana globalne, ale jej hodnota sa meni vramci funkcie "Verify" - ak je overenie uspesne, zmeni sa na 1
        //NA TOTO SOM NEVEDEL PRIST PRECO TO FUNGUJE VZDY AZ NA DRUHY KRAT, TEDA KED SA PRIHLASIM A ZAVOLAM ENDPOINT 1. X TAK VZDY
        //HODNOTA VERIFIED OSTAVA 0, ALE POTOM TO UZ FUNGUJE AKO MA... 
        if(verified==0){ 
            rep.send("invalid credentials")
        }else{
            verified = 0
        }
    
    }
    })
})

//===========================================ENDPOINT FOR ADDING ITEM TO LIST=====================================

app.put<{Querystring:Iquerystring,Body:newitem}>("/add_item",(req,rep)=>{

    const listID = +req.query.listsID
    const listName = req.query.listName
    const newitem = req.body.newitem

//============FUNCTION FOR UPDATING LIST=======================

    const updateList = async (input_id:number,listname:string,username:string) => {

        //check ci je pouzivatel previazany na zoznam

        const ownersDB = await prisma.to_do_lists.findUnique(
            {where:{id:input_id},
            select:{
                owners: true
            }}
        )
        const ownersOBJ:{owners:string[]} = Object(ownersDB)
            
        if(ownersOBJ.owners.includes(username)){

            //vytiahnu sa prislusne To Dos,z nich konkretny zoznam, pushne sa donho novy item a zapise sa cely To Do nazad na
            //rovnaku poziciu 
        const returnedLists = await prisma.to_do_lists.findUnique(
            {where:{id:input_id},
            select:{
                to_DOs: true
            }}
        )

        var fromDB:object = Object(returnedLists?.to_DOs!)
        var list_updated:object[] = fromDB[listname as keyof typeof fromDB]
        list_updated.push(newitem)
    
        const promise = await prisma.to_do_lists.update({
        where:{id:input_id},
        data:{
            to_DOs:fromDB
        }
    })
    rep.send("success")
    }else{
        rep.send("User is not owner of To_Do lists")
    }
}

//============ FLOW =======================

const auth:string = String(req.headers.authorization)
    
app.jwt.verify(auth.split(' ')[1],(err,decoded)=>{

if (err){
    rep.send("invalid token")
}else{
    const username = decoded.username
    const password = decoded.password
    Verify(username,password,updateList(listID,listName,username))

    if(verified==0){ 
        rep.send("invalid credentials")
    }else{
        verified = 0
    }

}
})
    
})

//===========================================ENDPOINT FOR LIST CHECKING=====================================

app.get<{Querystring:Iquerystring}>("/get_lists",(req,rep)=>{
    
    const listsID = req.query.listsID
    const listName = req.query.listName
    const numericID = +listsID

    async function getList(input_id:number,listname:string){
        const returnedLists = await prisma.to_do_lists.findUnique(
            {where:{id:input_id},
            select:{
                to_DOs: true
            }}
        )

        const fromDB:object = Object(returnedLists?.to_DOs!)
        rep.send(fromDB[listname as keyof typeof fromDB])
    }

    getList(numericID,listName)
})

//===========================================ENDPOINT FOR LIST CREATION=====================================

app.post<{Body:IBody}>("/create_list",(req,rep)=>{

    const {owners, to_DOs} = req.body

//============FUNCTION FOR CREATING LIST=======================

    const createList = async(owns:string[],tds:object) => {
    
        const newUser = await prisma.to_do_lists.create({data:{
        owners: owns,
        to_DOs: tds}})
        const usercount = await prisma.to_do_lists.count()
        rep.send({"To_DOs_ID":usercount})
    }

//============ FLOW =======================

        const auth:string = String(req.headers.authorization)
    
        app.jwt.verify(auth.split(' ')[1],(err,decoded)=>{

        if (err){
            rep.send("invalid token")
        }else{
            const username = decoded.username
            const password = decoded.password
            Verify(username,password,createList(owners,to_DOs))
            
            if(verified==0){ 
                rep.send("invalid credentials")
            }else{
                verified = 0
            }
        }
    })
    
  })

//================================================================SERVER LISTENING===========================

app.listen({port:3000},(err,adress)=>{
    if(err){
        app.log.error(err)
    }else {
        app.log.info("Server listening on " + adress)
    }
})
