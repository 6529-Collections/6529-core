import { TokenPair, PoolData } from "../types";
import { ethers } from "ethersv5";
import { Pool, Trade, Route } from "@uniswap/v3-sdk";
import {
  CurrencyAmount,
  Percent,
  Token as SDKToken,
  Currency,
  TradeType,
} from "@uniswap/sdk-core";
import { UNISWAP_V3_POOL_ABI } from "../abis";
import { toSDKToken } from "../types";
import { WETH_ADDRESS, SupportedChainId } from "../constants";

export class UniswapSDK {
  private provider: ethers.providers.Provider;
  private chainId: number;

  constructor(provider: ethers.providers.Provider, chainId: number) {
    this.provider = provider;
    this.chainId = chainId;
  }

  async getPool(pair: TokenPair): Promise<PoolData> {
    const poolContract = new ethers.Contract(
      pair.poolAddress,
      UNISWAP_V3_POOL_ABI,
      this.provider
    );

    const [slot0, liquidity, token0Address, token1Address] = await Promise.all([
      poolContract.slot0(),
      poolContract.liquidity(),
      poolContract.token0(),
      poolContract.token1(),
    ]);

    const token0 = token0Address.toLowerCase();
    const token1 = token1Address.toLowerCase();

    // Validate token ordering
    if (
      ![
        pair.inputToken.address.toLowerCase(),
        pair.outputToken.address.toLowerCase(),
      ].includes(token0) ||
      ![
        pair.inputToken.address.toLowerCase(),
        pair.outputToken.address.toLowerCase(),
      ].includes(token1)
    ) {
      throw new Error("Token mismatch in pool");
    }

    return {
      address: pair.poolAddress,
      fee: pair.fee,
      token0:
        token0 === pair.inputToken.address.toLowerCase()
          ? pair.inputToken
          : pair.outputToken,
      token1:
        token0 === pair.inputToken.address.toLowerCase()
          ? pair.outputToken
          : pair.inputToken,
      sqrtPriceX96: BigInt(slot0.sqrtPriceX96.toString()),
      liquidity: BigInt(liquidity.toString()),
      tick: slot0.tick,
    };
  }

  calculatePrice(poolData: PoolData): {
    baseToQuote: number;
    quoteToBase: number;
  } {
    const Q96 = BigInt(2 ** 96);
    const price0Per1 = Number(poolData.sqrtPriceX96) / Number(Q96);
    const rawPrice = price0Per1 * price0Per1;

    // Apply decimal adjustment
    const decimalsAdjustment =
      10 ** (poolData.token1.decimals - poolData.token0.decimals);
    const adjustedPrice = rawPrice * decimalsAdjustment;

    // Get the base price (token1 in terms of token0)
    const token1Price = adjustedPrice;
    const token0Price = 1 / adjustedPrice;

    // Return prices based on which token is token0 in the pool
    const isToken0Input =
      poolData.token0.address.toLowerCase() ===
      poolData.token1.address.toLowerCase();

    return {
      baseToQuote: token1Price, // Always return token1 price in terms of token0
      quoteToBase: token0Price, // Always return token0 price in terms of token1
    };
  }

  async getQuote(
    pair: TokenPair,
    amount: string,
    slippageTolerance: Percent
  ): Promise<{
    expectedOutput: string;
    minimumOutput: string;
    priceImpact: string;
    trade: Trade<Currency, Currency, TradeType>;
  }> {
    try {
      console.log("Getting Quote for:", {
        inputToken: pair.inputToken.symbol,
        outputToken: pair.outputToken.symbol,
        amount,
        slippage: slippageTolerance.toFixed(2),
      });

      const poolData = await this.getPool(pair);

      // Convert ETH to WETH for SDK operations
      const inputToken =
        pair.inputToken.symbol === "ETH"
          ? new SDKToken(
              this.chainId,
              WETH_ADDRESS[this.chainId as SupportedChainId],
              18,
              "WETH",
              "Wrapped Ether"
            )
          : toSDKToken(pair.inputToken, this.chainId);

      const outputToken =
        pair.outputToken.symbol === "ETH"
          ? new SDKToken(
              this.chainId,
              WETH_ADDRESS[this.chainId as SupportedChainId],
              18,
              "WETH",
              "Wrapped Ether"
            )
          : toSDKToken(pair.outputToken, this.chainId);

      const sdkPool = await this.createSDKPool(poolData);

      // Create input amount using WETH if input is ETH
      const inputAmount = CurrencyAmount.fromRawAmount(
        inputToken,
        ethers.utils.parseUnits(amount, pair.inputToken.decimals).toString()
      );

      console.log("Input Amount:", {
        raw: inputAmount.quotient.toString(),
        formatted: inputAmount.toExact(),
      });

      // Get output amount
      const [outputAmount] = await sdkPool.getOutputAmount(inputAmount);
      console.log("Output Amount:", {
        raw: outputAmount.quotient.toString(),
        formatted: outputAmount.toExact(),
      });

      // Create trade
      const route = new Route([sdkPool], inputToken, outputToken);
      const trade = Trade.createUncheckedTrade({
        route,
        inputAmount,
        outputAmount,
        tradeType: TradeType.EXACT_INPUT,
      });

      // Calculate minimum amount with slippage
      const minimumAmount = outputAmount.multiply(
        new Percent(100, 100).subtract(slippageTolerance)
      );

      console.log("Trade Details:", {
        executionPrice: trade.executionPrice.toSignificant(6),
        priceImpact: trade.priceImpact.toSignificant(2),
        minimumAmount: minimumAmount.toExact(),
        routeTokens: route.tokenPath.map((token: Currency) => ({
          symbol: token.symbol,
          address: "address" in token ? token.address : "native",
        })),
      });

      return {
        expectedOutput: ethers.utils.formatUnits(
          outputAmount.quotient.toString(),
          pair.outputToken.decimals
        ),
        minimumOutput: ethers.utils.formatUnits(
          minimumAmount.quotient.toString(),
          pair.outputToken.decimals
        ),
        priceImpact: trade.priceImpact.toSignificant(2),
        trade,
      };
    } catch (error) {
      console.error("Quote Error:", error);
      throw error;
    }
  }

  private calculatePriceImpact(
    inputAmount: CurrencyAmount<Currency>,
    outputAmount: CurrencyAmount<Currency>,
    pool: Pool
  ): Percent {
    try {
      // Ensure we're working with Token types
      if (
        !(inputAmount.currency instanceof SDKToken) ||
        !(outputAmount.currency instanceof SDKToken)
      ) {
        return new Percent(0, 100); // Return 0% impact for native currency
      }

      // Now TypeScript knows these are Token types
      const inputToken = inputAmount.currency as SDKToken;
      const outputToken = outputAmount.currency as SDKToken;

      // Calculate price impact using the pool's current prices
      if (inputToken.equals(pool.token0)) {
        // Input is token0, use token0Price
        const expectedOutput = pool.token0Price.quote(
          inputAmount as CurrencyAmount<SDKToken>
        );
        const priceImpact = expectedOutput
          .subtract(outputAmount as CurrencyAmount<SDKToken>)
          .divide(expectedOutput)
          .multiply(new Percent(-1, 1)); // Invert the sign

        return new Percent(priceImpact.numerator, priceImpact.denominator);
      } else {
        // Input is token1, use token1Price
        const expectedOutput = pool.token1Price.quote(
          inputAmount as CurrencyAmount<SDKToken>
        );
        const priceImpact = expectedOutput
          .subtract(outputAmount as CurrencyAmount<SDKToken>)
          .divide(expectedOutput)
          .multiply(new Percent(-1, 1)); // Invert the sign

        return new Percent(priceImpact.numerator, priceImpact.denominator);
      }
    } catch (error) {
      console.error("Price impact calculation error:", error);
      // Return a default 0% impact if calculation fails
      return new Percent(0, 100);
    }
  }

  private async createSDKPool(poolData: PoolData): Promise<Pool> {
    const provider = this.provider;

    // Convert tokens to SDK tokens, handling ETH/WETH conversion
    const token0 =
      poolData.token0.symbol === "ETH"
        ? new SDKToken(
            this.chainId,
            WETH_ADDRESS[this.chainId as SupportedChainId],
            18,
            "WETH",
            "Wrapped Ether"
          )
        : toSDKToken(poolData.token0, this.chainId);

    const token1 =
      poolData.token1.symbol === "ETH"
        ? new SDKToken(
            this.chainId,
            WETH_ADDRESS[this.chainId as SupportedChainId],
            18,
            "WETH",
            "Wrapped Ether"
          )
        : toSDKToken(poolData.token1, this.chainId);

    interface TickData {
      liquidityNet: string;
      liquidityGross: string;
      feeGrowthOutside0X128: string;
      feeGrowthOutside1X128: string;
      tickCumulativeOutside: string;
      secondsPerLiquidityOutsideX128: string;
      secondsOutside: number;
      initialized: boolean;
    }

    // Create tick data provider
    const tickDataProvider = {
      async getTick(tick: number): Promise<TickData> {
        const poolContract = new ethers.Contract(
          poolData.address,
          UNISWAP_V3_POOL_ABI,
          provider
        );

        try {
          const { liquidityNet } = (await poolContract.ticks(tick)) as {
            liquidityNet: ethers.BigNumber;
          };
          return {
            liquidityNet: liquidityNet.toString(),
            liquidityGross: "0",
            feeGrowthOutside0X128: "0",
            feeGrowthOutside1X128: "0",
            tickCumulativeOutside: "0",
            secondsPerLiquidityOutsideX128: "0",
            secondsOutside: 0,
            initialized: true,
          };
        } catch (e) {
          // If tick doesn't exist, return empty tick with 0 liquidity
          return {
            liquidityNet: "0",
            liquidityGross: "0",
            feeGrowthOutside0X128: "0",
            feeGrowthOutside1X128: "0",
            tickCumulativeOutside: "0",
            secondsPerLiquidityOutsideX128: "0",
            secondsOutside: 0,
            initialized: false,
          };
        }
      },

      async nextInitializedTickWithinOneWord(
        tick: number,
        lte: boolean,
        tickSpacing: number
      ): Promise<[number, boolean]> {
        const poolContract = new ethers.Contract(
          poolData.address,
          UNISWAP_V3_POOL_ABI,
          provider
        );

        // Calculate the next tick based on tick spacing
        const compressed = Math.floor(tick / tickSpacing);
        const next = lte
          ? compressed * tickSpacing
          : (compressed + 1) * tickSpacing;

        try {
          const { liquidityNet } = (await poolContract.ticks(next)) as {
            liquidityNet: ethers.BigNumber;
          };
          const initialized = !liquidityNet.isZero();
          return [next, initialized];
        } catch (e) {
          return [next, false];
        }
      },
    };

    return new Pool(
      token0,
      token1,
      poolData.fee,
      poolData.sqrtPriceX96.toString(),
      poolData.liquidity.toString(),
      poolData.tick,
      tickDataProvider
    );
  }
}
